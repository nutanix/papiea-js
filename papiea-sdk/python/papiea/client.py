import time
import logging
from types import TracebackType
from typing import Any, Optional, List, Type, Callable, AsyncGenerator

from opentracing import Tracer

from .api import ApiInstance
from .core import AttributeDict, Entity, EntityReference, EntitySpec, IntentfulStatus, IntentWatcher, Metadata, Secret, \
    Spec
from .tracing_utils import init_default_tracer, inject_tracing_headers

FilterResults = AttributeDict

BATCH_SIZE = 20


class EntityCRUD(object):
    def __init__(
            self,
            papiea_url: str,
            prefix: str,
            version: str,
            kind: str,
            s2skey: Optional[str] = None,
            logger: logging.Logger = logging.getLogger(__name__),
            tracer: Tracer = init_default_tracer()
    ):
        headers = {
            "Content-Type": "application/json",
        }
        if s2skey is not None:
            headers["Authorization"] = f"Bearer {s2skey}"
        self.api_instance = ApiInstance(
            f"{papiea_url}/services/{prefix}/{version}/{kind}", headers=headers, logger=logger
        )
        self.kind = kind
        self.tracer = tracer
        self.__constructor_present = None

    async def __aenter__(self) -> "EntityCRUD":
        return self

    async def __aexit__(
            self,
            exc_type: Optional[Type[BaseException]],
            exc_val: Optional[BaseException],
            exc_tb: Optional[TracebackType],
    ) -> None:
        await self.api_instance.close()
        self.tracer.close()

    async def get(self, entity_reference: EntityReference) -> Entity:
        with self.tracer.start_span(operation_name=f"get_entity_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            return await self.api_instance.get(entity_reference.uuid)

    async def get_all(self) -> List[Entity]:
        with self.tracer.start_span(operation_name=f"list_entities_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            res = await self.api_instance.get("")
            return res.results

    async def create(self, payload: Any) -> EntitySpec:
        with self.tracer.start_span(operation_name=f"create_entity_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            return await self.api_instance.post("", payload)

    async def update(self, metadata: Metadata, spec: Spec) -> EntitySpec:
        with self.tracer.start_span(operation_name=f"update_entity_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            payload = {"metadata": {"spec_version": metadata.spec_version}, "spec": spec}
            return await self.api_instance.put(metadata.uuid, payload)

    async def delete(self, entity_reference: EntityReference) -> None:
        with self.tracer.start_span(operation_name=f"delete_entity_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            return await self.api_instance.delete(entity_reference.uuid)

    async def filter(self, filter_obj: Any) -> FilterResults:
        with self.tracer.start_span(operation_name=f"filter_entities_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            return await self.api_instance.post("filter", filter_obj)

    async def filter_iter(self, filter_obj: Any) -> Callable[[Optional[int], Optional[int]], AsyncGenerator[Any, None]]:
        async def iter_func(batch_size: Optional[int] = None, offset: Optional[int] = None):
            if not batch_size:
                batch_size = BATCH_SIZE
            res = await self.api_instance.post(f"filter?limit={batch_size}&offset={offset or ''}", filter_obj)
            if len(res.results) == 0:
                return
            else:
                for entity in res.results:
                    yield entity
                offset = offset or 0
                async for val in iter_func(batch_size, offset + batch_size):
                    yield val
                return

        return iter_func

    async def list_iter(self) -> Callable[[Optional[int], Optional[int]], AsyncGenerator[Any, None]]:
        return await self.filter_iter({})

    async def invoke_procedure(
            self, procedure_name: str, entity_reference: EntityReference, input_: Any
    ) -> Any:
        with self.tracer.start_span(operation_name=f"invoke_{procedure_name}_procedure_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            payload = input_
            return await self.api_instance.post(
                f"{entity_reference.uuid}/procedure/{procedure_name}", payload
            )

    async def invoke_kind_procedure(self, procedure_name: str, input_: Any) -> Any:
        with self.tracer.start_span(operation_name=f"invoke_{procedure_name}_kind_procedure_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            payload = input_
            return await self.api_instance.post(f"procedure/{procedure_name}", payload)


class IntentWatcherClient(object):
    def __init__(
            self,
            papiea_url: str,
            s2skey: Secret = None,
            logger: logging.Logger = logging.getLogger(__name__),
            tracer: Optional[Tracer] = init_default_tracer()
    ):
        headers = {
            "Content-Type": "application/json",
        }

        self.tracer = tracer

        if s2skey is not None:
            headers["Authorization"] = f"Bearer {s2skey}"
        self.api_instance = ApiInstance(
            f"{papiea_url}/services/intent_watcher", headers=headers, logger=logger
        )

        self.logger = logger

    async def __aenter__(self) -> "IntentWatcherClient":
        return self

    async def __aexit__(
            self,
            exc_type: Optional[Type[BaseException]],
            exc_val: Optional[BaseException],
            exc_tb: Optional[TracebackType]
    ) -> None:
        await self.api_instance.close()
        self.tracer.close()

    async def get_intent_watcher(self, id: str) -> IntentWatcher:
        with self.tracer.start_span(operation_name=f"get_intent_watcher_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            return await self.api_instance.get(id)

    async def list_intent_watcher(self) -> List[IntentWatcher]:
        with self.tracer.start_span(operation_name=f"list_intent_watchers_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            res = await self.api_instance.get("")
            return res.results

    # filter_intent_watcher(AttributeDict(status=IntentfulStatus.Pending))
    async def filter_intent_watcher(self, filter_obj: Any) -> List[IntentWatcher]:
        with self.tracer.start_span(operation_name=f"filter_intent_watcher_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            res = await self.api_instance.post("filter", filter_obj)
            return res.results

    async def wait_for_watcher_status(self, watcher_ref: AttributeDict, watcher_status: IntentfulStatus,
                                      timeout_secs: float = 50, delay_millis: float = 500) -> bool:
        start_time = time.time()
        delay_secs = delay_millis / 1000
        while True:
            watcher = await self.get_intent_watcher(watcher_ref.uuid)
            if watcher.status == watcher_status:
                return True
            end_time = time.time()
            time_elapsed = end_time - start_time
            if time_elapsed > timeout_secs:
                raise Exception(f"Timeout waiting for change in watcher status with uuid: {watcher_ref.uuid} for entity with uuid: {watcher.entity_ref.uuid} and kind: {watcher.entity_ref.kind} in provider with prefix: {watcher.entity_ref.provider_prefix} and version: {watcher.entity_ref.provider_version},"
                                f" desired status: {watcher_status} and current status: {watcher.status}")
            time.sleep(delay_secs)


class ProviderClient(object):
    def __init__(
            self,
            papiea_url: str,
            provider: str,
            version: str,
            s2skey: Optional[str] = None,
            logger: logging.Logger = logging.getLogger(__name__),
            tracer: Optional[Tracer] = init_default_tracer()
    ):
        self.papiea_url = papiea_url
        self.provider = provider
        self.version = version
        self.s2skey = s2skey
        self.logger = logger
        headers = {
            "Content-Type": "application/json",
        }
        if s2skey is not None:
            headers["Authorization"] = f"Bearer {s2skey}"
        self.api_instance = ApiInstance(
            f"{papiea_url}/services/{provider}/{version}", headers=headers, logger=logger
        )
        self.tracer = tracer

    async def __aenter__(self) -> "ProviderClient":
        return self

    async def __aexit__(
            self,
            exc_type: Optional[Type[BaseException]],
            exc_val: Optional[BaseException],
            exc_tb: Optional[TracebackType],
    ) -> None:
        await self.api_instance.close()
        self.tracer.close()

    def get_kind(self, kind: str) -> EntityCRUD:
        return EntityCRUD(
            self.papiea_url, self.provider, self.version, kind, self.s2skey, self.logger
        )

    async def invoke_procedure(self, procedure_name: str, input: Any) -> Any:
        with self.tracer.start_span(operation_name=f"invoke_{procedure_name}_procedure_client") as span:
            inject_tracing_headers(self.tracer, span, self.api_instance)
            payload = input
            return await self.api_instance.post(f"procedure/{procedure_name}", payload)
