import logging
from types import TracebackType
from typing import Any, Callable, List, NoReturn, Optional, Type, Union

from aiohttp import web
from opentracing import Tracer, Format, child_of

from .api import ApiInstance
from .client import IntentWatcherClient
from .core import (
    DataDescription,
    Entity,
    IntentfulExecutionStrategy,
    IntentfulSignature,
    Kind,
    ProceduralSignature,
    Provider,
    ProviderPower,
    S2SKey,
    Secret,
    UserInfo,
    Version, ProcedureDescription,
    ConstructorProcedureDescription,
    ConstructorResult, CreateS2SKeyRequest
)
from .python_sdk_context import IntentfulCtx, ProceduralCtx
from .python_sdk_exceptions import InvocationError, SecurityApiError
from .utils import json_loads_attrs, validate_error_codes
from .tracing_utils import init_default_tracer, get_special_operation_name


class ProviderServerManager(object):
    def __init__(self, public_host: str = "127.0.0.1", public_port: int = 9000):
        self.public_host = public_host
        self.public_port = public_port
        self.should_run = False
        self.app = web.Application()
        self._runner = None

    def register_handler(
            self, route: str, handler: Callable[[web.Request], web.Response]
    ) -> None:
        if not self.should_run:
            self.should_run = True
        self.app.add_routes([web.post(route, handler)])

    def register_healthcheck(self) -> None:
        if not self.should_run:
            self.should_run = True

        async def healthcheck_callback_fn(request):
            return web.json_response({"status": "Available"}, status=200)

        self.app.add_routes([web.get("/healthcheck", healthcheck_callback_fn)])

    async def start_server(self) -> NoReturn:
        if self.should_run:
            runner = web.AppRunner(self.app)
            await runner.setup()
            self._runner = runner
            site = web.TCPSite(runner, self.public_host, self.public_port)
            await site.start()

    async def close(self) -> None:
        if self._runner is not None:
            await self._runner.cleanup()

    def callback_url(self) -> str:
        return f"http://{self.public_host}:{self.public_port}"

    def procedure_callback_url(self, procedure_name: str, kind: Optional[str]) -> str:
        if kind is not None:
            return f"http://{self.public_host}:{self.public_port}/{kind}/{procedure_name}"
        else:
            return (
                f"http://{self.public_host}:{self.public_port}/{procedure_name}"
            )


class SecurityApi(object):
    def __init__(self, provider, s2s_key: Secret):
        self.provider = provider
        self.s2s_key = s2s_key

    async def user_info(self) -> UserInfo:
        "Returns the user-info of user with s2skey or the current user"
        try:
            url = f"{self.provider.get_prefix()}/{self.provider.get_version()}"
            res = await self.provider.provider_api.get(
                f"{url}/auth/user_info",
                headers={"Authorization": f"Bearer {self.s2s_key}"},
            )
            return res
        except Exception as e:
            raise SecurityApiError.from_error(e, "Cannot get user info")

    async def list_keys(self) -> List[S2SKey]:
        try:
            url = f"{self.provider.get_prefix()}/{self.provider.get_version()}"
            res = await self.provider.provider_api.get(
                f"{url}/s2skey", headers={"Authorization": f"Bearer {self.s2s_key}"}
            )
            return res
        except Exception as e:
            raise SecurityApiError.from_error(e, "Cannot list s2s keys")

    async def create_key(self, new_key: CreateS2SKeyRequest) -> S2SKey:
        try:
            url = f"{self.provider.get_prefix()}/{self.provider.get_version()}"
            res = await self.provider.provider_api.post(
                f"{url}/s2skey",
                data=new_key,
                headers={"Authorization": f"Bearer {self.s2s_key}"},
            )
            return res
        except Exception as e:
            raise SecurityApiError.from_error(e, "Cannot create s2s key")

    async def deactivate_key(self, key_to_deactivate: str) -> Any:
        try:
            url = f"{self.provider.get_prefix()}/{self.provider.get_version()}"
            res = await self.provider.provider_api.post(
                f"{url}/s2skey",
                data={"key": key_to_deactivate, "active": False},
                headers={"Authorization": f"Bearer {self.s2s_key}"},
            )
            return res
        except Exception as e:
            raise SecurityApiError.from_error(e, "Cannot deactivate s2s key")


class ProviderSdk(object):
    def __init__(
            self,
            papiea_url: str,
            s2skey: Secret,
            server_manager: Optional[ProviderServerManager] = None,
            allow_extra_props: bool = False,
            logger: logging.Logger = None,
            tracer: Tracer = init_default_tracer()
    ):
        self._version = None
        self._prefix = None
        self._kind = []
        self._provider = None
        self.logger = logger
        self.papiea_url = papiea_url
        self._s2skey = s2skey
        if server_manager is not None:
            self._server_manager = server_manager
        else:
            self._server_manager = ProviderServerManager()
        self.tracer = tracer
        self._procedures = {}
        self.meta_ext = {}
        self.allow_extra_props = allow_extra_props
        self._security_api = SecurityApi(self, s2skey)
        self._intent_watcher_client = IntentWatcherClient(papiea_url, s2skey, logger, tracer)
        self._provider_api = ApiInstance(
            self.provider_url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._s2skey}",
            },
            logger=self.logger
        )
        self._oauth2 = None
        self._authModel = None
        self._policy = None

    async def __aenter__(self) -> "ProviderSdk":
        return self

    async def __aexit__(
            self,
            exc_type: Optional[Type[BaseException]],
            exc_val: Optional[BaseException],
            exc_tb: Optional[TracebackType],
    ) -> None:
        await self._provider_api.close()

    @property
    def provider(self) -> Provider:
        if self._provider is not None:
            return self._provider
        else:
            raise Exception("Provider not created")

    @property
    def provider_url(self) -> str:
        return f"{self.papiea_url}/provider"

    @property
    def provider_api(self) -> ApiInstance:
        return self._provider_api

    @property
    def entity_url(self) -> str:
        return f"{self.papiea_url}/services"

    def get_prefix(self) -> str:
        if self._prefix is not None:
            return self._prefix
        else:
            raise Exception("Provider prefix is not set")

    def get_version(self) -> Version:
        if self._version is not None:
            return self._version
        else:
            raise Exception("Provider version is not set")

    @property
    def server(self) -> ProviderServerManager:
        return self._server_manager

    def new_kind(self, entity_description: DataDescription) -> "KindBuilder":
        if len(entity_description) == 0:
            raise Exception("Wrong kind description specified")
        for name in entity_description:
            if "x-papiea-entity" not in entity_description[name]:
                raise Exception(
                    f"Entity not a papiea entity. Please make sure you have 'x-papiea-entity' property for '{name}'"
                )
            the_kind = Kind(
                name=name,
                name_plural=name + "s",
                kind_structure=entity_description,
                intentful_signatures=[],
                dependency_tree={},
                kind_procedures={},
                entity_procedures={},
                intentful_behaviour=entity_description[name]["x-papiea-entity"],
                differ=None,
            )
            kind_builder = KindBuilder(the_kind, self, self.allow_extra_props, self.tracer)
            self._kind.append(the_kind)
            return kind_builder

    def add_kind(self, kind: Kind) -> Optional["KindBuilder"]:
        if kind not in self._kind:
            self._kind.append(kind)
            kind_builder = KindBuilder(kind, self, self.allow_extra_props, self.tracer)
            return kind_builder
        else:
            return None

    def remove_kind(self, kind: Kind) -> bool:
        try:
            self._kind.remove(kind)
            return True
        except ValueError:
            return False

    def version(self, version: Version) -> "ProviderSdk":
        self._version = version
        return self

    def prefix(self, prefix: str) -> "ProviderSdk":
        self._prefix = prefix
        return self

    def metadata_extension(self, ext: DataDescription) -> "ProviderSdk":
        self.meta_ext = ext
        return self

    def provider_procedure(
            self,
            name: str,
            procedure_description: ProcedureDescription,
            handler: Callable[[ProceduralCtx, Any], Any],
    ) -> "ProviderSdk":
        procedure_callback_url = self._server_manager.procedure_callback_url(name)
        callback_url = self._server_manager.callback_url()
        validate_error_codes(procedure_description["errors_schemas"])
        procedural_signature = ProceduralSignature(
            name=name,
            argument=procedure_description.get("input_schema", {}),
            result=procedure_description.get("output_schema", {}),
            execution_strategy=IntentfulExecutionStrategy.Basic,
            procedure_callback=procedure_callback_url,
            errors_schemas=procedure_description["errors_schemas"],
            base_callback=callback_url,
            description=procedure_description.get("description")
        )
        self._procedures[name] = procedural_signature
        prefix = self.get_prefix()
        version = self.get_version()

        async def procedure_callback_fn(req):
            try:
                body_obj = json_loads_attrs(await req.text())
                span_context = self.tracer.extract(
                    format=Format.HTTP_HEADERS,
                    carrier=req.headers,
                )
                with self.tracer.start_span(operation_name=f"{name}_provider_procedure_sdk", references=child_of(span_context)):
                    result = await handler(
                        ProceduralCtx(self, prefix, version, req.headers), body_obj
                    )
                    return web.json_response(result)
            except InvocationError as e:
                return web.json_response(e.to_response(), status=e.status_code)
            except Exception as e:
                e = InvocationError.from_error(e)
                return web.json_response(e.to_response(), status=e.status_code)

        self._server_manager.register_handler("/" + name, procedure_callback_fn)
        return self

    async def register(self) -> None:
        if (
                self._prefix is not None
                and self._version is not None
                and len(self._kind) > 0
        ):
            self._provider = Provider(
                kinds=self._kind,
                version=self._version,
                prefix=self._prefix,
                procedures=self._procedures,
                extension_structure=self.meta_ext,
                allowExtraProps=self.allow_extra_props,
            )
            if self._policy is not None:
                self._provider.policy = self._policy
            if self._oauth2 is not None:
                self._provider.oauth2 = self._oauth2
            if self._authModel is not None:
                self._provider.authModel = self._authModel
            await self._provider_api.post("/", self._provider)
            await self._server_manager.start_server()
        elif self._prefix is None:
            ProviderSdk._provider_description_error("prefix")
        elif self._version is None:
            ProviderSdk._provider_description_error("version")
        elif len(self._kind) == 0:
            ProviderSdk._provider_description_error("kind")

    def power(self, state: ProviderPower) -> ProviderPower:
        raise Exception("Unimplemented")

    @staticmethod
    def _provider_description_error(missing_field: str) -> NoReturn:
        raise Exception(f"Malformed provider description. Missing: {missing_field}")

    @staticmethod
    def create_provider(
            papiea_url: str,
            s2skey: Secret,
            public_host: Optional[str],
            public_port: Optional[int],
            allow_extra_props: bool = False,
            logger: logging.Logger = logging.getLogger(__name__),
            tracer: Tracer = init_default_tracer()
    ) -> "ProviderSdk":
        server_manager = ProviderServerManager(public_host, public_port)
        return ProviderSdk(papiea_url, s2skey, server_manager, allow_extra_props, logger, tracer)

    def secure_with(
            self, oauth_config: Any, casbin_model: str, casbin_initial_policy: str
    ) -> "ProviderSdk":
        self._oauth2 = oauth_config
        self._authModel = casbin_model
        self._policy = casbin_initial_policy
        return self

    @property
    def server_manager(self) -> ProviderServerManager:
        return self._server_manager

    @property
    def provider_security_api(self) -> SecurityApi:
        return self._security_api

    def new_security_api(self, s2s_key: str) -> SecurityApi:
        return SecurityApi(self, s2s_key)

    @property
    def s2s_key(self) -> Secret:
        return self._s2skey

    @property
    def intent_watcher(self) -> IntentWatcherClient:
        return self._intent_watcher_client


class KindBuilder:
    def __init__(self, kind: Kind, provider: ProviderSdk, allow_extra_props: bool, tracer: Tracer):
        self.kind = kind
        self.provider = provider
        self.allow_extra_props = allow_extra_props

        self.server_manager = provider.server_manager
        self.entity_url = provider.entity_url
        self.provider_url = provider.provider_url
        self.tracer = tracer

    def get_prefix(self) -> str:
        return self.provider.get_prefix()

    def get_version(self) -> str:
        return self.provider.get_version()

    def entity_procedure(
            self,
            name: str,
            procedure_description: ProcedureDescription,
            handler: Callable[[ProceduralCtx, Entity, Any], Any],
    ) -> "KindBuilder":
        procedure_callback_url = self.server_manager.procedure_callback_url(
            name, self.kind["name"]
        )
        callback_url = self.server_manager.callback_url()
        validate_error_codes(procedure_description.get("errors_schemas", {}))
        procedural_signature = ProceduralSignature(
            name=name,
            argument=procedure_description.get("input_schema", {}),
            result=procedure_description.get("output_schema", {}),
            execution_strategy=IntentfulExecutionStrategy.Basic,
            procedure_callback=procedure_callback_url,
            errors_schemas=procedure_description.get("errors_schemas", {}),
            base_callback=callback_url,
            description=procedure_description.get("description")
        )
        self.kind["entity_procedures"][name] = procedural_signature
        prefix = self.get_prefix()
        version = self.get_version()

        async def procedure_callback_fn(req):
            try:
                body_obj = json_loads_attrs(await req.text())
                span_context = self.tracer.extract(
                    format=Format.HTTP_HEADERS,
                    carrier=req.headers,
                )
                with self.tracer.start_span(operation_name=f"{name}_entity_procedure", references=child_of(span_context)):
                    result = await handler(
                        ProceduralCtx(self.provider, prefix, version, req.headers),
                        Entity(
                            metadata=body_obj.metadata,
                            spec=body_obj.get("spec", {}),
                            status=body_obj.get("status", {}),
                        ),
                        body_obj.input,
                    )
                    return web.json_response(result)
            except InvocationError as e:
                return web.json_response(e.to_response(), status=e.status_code)
            except Exception as e:
                e = InvocationError.from_error(e)
                return web.json_response(e.to_response(), status=e.status_code)

        self.server_manager.register_handler(
            f"/{self.kind['name']}/{name}", procedure_callback_fn
        )
        return self

    def kind_procedure(
            self,
            name: str,
            procedure_description: Union[ProcedureDescription, ConstructorProcedureDescription],
            handler: Callable[[ProceduralCtx, Any], Any],
    ) -> "KindBuilder":
        procedure_callback_url = self.server_manager.procedure_callback_url(
            name, self.kind["name"]
        )
        callback_url = self.server_manager.callback_url()
        validate_error_codes(procedure_description.get("errors_schemas", {}))
        procedural_signature = ProceduralSignature(
            name=name,
            argument=procedure_description.get("input_schema", {}),
            result=procedure_description.get("output_schema", {}),
            execution_strategy=IntentfulExecutionStrategy.Basic,
            procedure_callback=procedure_callback_url,
            errors_schemas=procedure_description.get("errors_schemas", {}),
            base_callback=callback_url,
            description=procedure_description.get("description")
        )
        self.kind["kind_procedures"][name] = procedural_signature
        prefix = self.get_prefix()
        version = self.get_version()

        async def procedure_callback_fn(req):
            try:
                span_context = self.tracer.extract(
                    format=Format.HTTP_HEADERS,
                    carrier=req.headers,
                )
                operation_name = get_special_operation_name(name, prefix, version, self.kind.name)
                with self.tracer.start_span(operation_name=operation_name, references=child_of(span_context)):
                    body_obj = json_loads_attrs(await req.text())
                    result = await handler(
                        ProceduralCtx(self.provider, prefix, version, req.headers),
                        body_obj.input,
                    )
                    return web.json_response(result)
            except InvocationError as e:
                return web.json_response(e.to_response(), status=e.status_code)
            except Exception as e:
                e = InvocationError.from_error(e)
                return web.json_response(e.to_response(), status=e.status_code)

        self.server_manager.register_handler(
            f"/{self.kind['name']}/{name}", procedure_callback_fn
        )
        return self

    def on(
            self, sfs_signature: str, handler: Callable[[IntentfulCtx, Entity, Any], Any],
    ) -> "KindBuilder":
        procedure_callback_url = self.server_manager.procedure_callback_url(
            sfs_signature, self.kind["name"]
        )
        callback_url = self.server_manager.callback_url()
        self.kind["intentful_signatures"].append(
            IntentfulSignature(
                signature=sfs_signature,
                name=sfs_signature,
                argument={
                    "IntentfulInput": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "keys": {"type": "object"},
                                "key": {"type": "string"},
                                "spec-val": {"type": "array"},
                                "status-val": {"type": "array"},
                            },
                        },
                    }
                },
                result={
                    "IntentfulOutput": {
                        "type": "object",
                        "nullable": "true",
                        "properties": {
                            "delay_secs": {"type": "integer"}
                        },
                        "description": "Amount of seconds to wait before this entity will be checked again by the intent engine"
                    }
                },
                execution_strategy=IntentfulExecutionStrategy.Basic,
                procedure_callback=procedure_callback_url,
                base_callback=callback_url,
            )
        )
        prefix = self.get_prefix()
        version = self.get_version()

        async def procedure_callback_fn(req):
            try:
                span_context = self.tracer.extract(
                    format=Format.HTTP_HEADERS,
                    carrier=req.headers,
                )
                with self.tracer.start_span(operation_name=f"{sfs_signature}_handler_procedure", references=child_of(span_context)):
                    body_obj = json_loads_attrs(await req.text())
                    result = await handler(
                        IntentfulCtx(self.provider, prefix, version, req.headers),
                        Entity(
                            metadata=body_obj.metadata,
                            spec=body_obj.get("spec", {}),
                            status=body_obj.get("status", {}),
                        ),
                        body_obj.input,
                    )
                return web.json_response(result)
            except InvocationError as e:
                return web.json_response(e.to_response(), status=e.status_code)
            except Exception as e:
                e = InvocationError.from_error(e)
                return web.json_response(e.to_response(), status=e.status_code)

        self.server_manager.register_handler(
            f"/{self.kind['name']}/{sfs_signature}", procedure_callback_fn
        )
        self.server_manager.register_healthcheck()
        return self

    def on_create(self, description: ConstructorProcedureDescription, handler: Callable[[ProceduralCtx, Any], ConstructorResult]) -> "KindBuilder":
        name = f"__{self.kind['name']}_create"
        if description.get("input_schema") == None:
            description["input_schema"] = self.kind['kind_structure']
        self.kind_procedure(
            name, description, handler
        )
        return self

    def on_delete(
        self,
        handler: Callable[[ProceduralCtx, Any], Any],
    ) -> "KindBuilder":
        name = f"__{self.kind['name']}_delete"
        self.kind_procedure(
            name, ProcedureDescription(), handler
        )
        return self
