import e2e_tests as papiea_test
import e2e_tests.procedure_handlers as procedure_handlers

from papiea.core import Key, ProcedureDescription, CreateS2SKeyRequest, ConstructorProcedureDescription
from papiea.python_sdk import ProviderSdk
from papiea.python_sdk_exceptions import SecurityApiError

bucket_yaml = papiea_test.load_yaml_from_file("./kinds/bucket_kind.yml")
object_yaml = papiea_test.load_yaml_from_file("./kinds/object_kind.yml")

bucket_yaml.get("bucket").get("properties").get("objects").get("items") \
    .get("properties")["reference"] = papiea_test.ref_type(papiea_test.OBJECT_KIND, "Reference of the objects within the bucket")

object_yaml.get("object").get("properties").get("references").get("items") \
    .get("properties")["bucket_reference"] = papiea_test.ref_type(papiea_test.BUCKET_KIND, "Reference of the bucket in which the object exists")

metadata_extension = papiea_test.load_yaml_from_file("./security/metadata_extension.yml")

async def create_provider_admin_s2s_key(sdk: ProviderSdk, new_key: Key):
    admin_security_api = sdk.provider_security_api

    the_key = CreateS2SKeyRequest(
        name="Test provider admin S2S key",
        owner="nitesh.idnani@nutanix.com",
        key=new_key,
        user_info={"is_provider_admin": True},
    )

    try:
        keys = await admin_security_api.list_keys()
        for key in keys:
            if key.name == the_key.name:
                papiea_test.logger.debug(f"Key {the_key.name} already exists")
                return
    except SecurityApiError as err:
        raise SecurityApiError.from_error(err, str(err))

    try:
        await admin_security_api.create_key(the_key)
        provider_admin_security_api = sdk.new_security_api(new_key)
        await provider_admin_security_api.user_info()
        # papiea_test.logger.debug(f"User info {user_info}")
    except SecurityApiError as err:
        raise SecurityApiError.from_error(err, str(err))

async def create_user_s2s_key(sdk: ProviderSdk):
    admin_security_api = sdk.provider_security_api

    the_key = CreateS2SKeyRequest(
        name="test provider some.user s2s key",
        user_info={"owner": "nutanix"},
    )

    try:
        new_s2s_key = await admin_security_api.create_key(the_key)
        user_security_api = sdk.new_security_api(new_s2s_key.key)
        await user_security_api.user_info()
        return new_s2s_key.key
    except SecurityApiError as err:
        raise SecurityApiError.from_error(err, str(err))

async def setup_and_register_sdk() -> ProviderSdk:
    try:
        async with ProviderSdk.create_provider(
            papiea_test.PAPIEA_URL, papiea_test.PAPIEA_ADMIN_S2S_KEY, papiea_test.SERVER_CONFIG_HOST, papiea_test.SERVER_CONFIG_PORT, logger=papiea_test.logger
        ) as sdk:
            sdk.version(papiea_test.PROVIDER_VERSION)
            sdk.prefix(papiea_test.PROVIDER_PREFIX)

            # TODO: Add security policy to set the secure_with parameters
            sdk.metadata_extension(metadata_extension)

            await create_provider_admin_s2s_key(sdk, papiea_test.PROVIDER_ADMIN_S2S_KEY)

            bucket = sdk.new_kind(bucket_yaml)
            obj = sdk.new_kind(object_yaml)

            bucket.on_create(ConstructorProcedureDescription(
                input_schema={
                    "Bucket": {
                        "properties": {
                            "name": {
                                "type": "string"
                            },
                            "owner": {
                                "type": "string"
                            },
                            "objects": {
                                "type": "array"
                            }
                        }
                    }
                }
            ), procedure_handlers.bucket_create_handler)
            obj.on_create(ConstructorProcedureDescription(
                input_schema={
                    "Object": {
                        "properties": {
                            "content": {
                                "type": "string"
                            },
                            "owner": {
                                "type": "string"
                            }
                        }
                    }
                }
            ),procedure_handlers.object_create_handler)

            bucket.on("name", procedure_handlers.bucket_name_handler)
            bucket.on("objects.+{name}", procedure_handlers.on_object_added_handler)
            bucket.on("objects.-{name}", procedure_handlers.on_object_removed_handler)

            obj.on("content", procedure_handlers.object_content_handler)

            bucket.kind_procedure(
                "ensure_bucket_exists",
                ProcedureDescription(
                    input_schema=procedure_handlers.ensure_bucket_exists_takes,
                    output_schema=procedure_handlers.ensure_bucket_exists_returns,
                    description="Description for ensure_bucket_exists kind-level procedure"
                ),
                procedure_handlers.ensure_bucket_exists
            )

            bucket.entity_procedure(
                "change_bucket_name",
                ProcedureDescription(
                    input_schema=procedure_handlers.change_bucket_name_takes,
                    output_schema=procedure_handlers.change_bucket_name_returns,
                    description="Description for change_bucket_name entity-level procedure"
                ),
                procedure_handlers.change_bucket_name
            )

            bucket.entity_procedure(
                "create_object",
                ProcedureDescription(
                    input_schema=procedure_handlers.create_object_takes,
                    output_schema=procedure_handlers.create_object_returns,
                    description="Description for create_object entity-level procedure"
                ),
                procedure_handlers.create_object
            )

            bucket.entity_procedure(
                "link_object",
                ProcedureDescription(
                    input_schema=procedure_handlers.link_object_takes,
                    output_schema=procedure_handlers.link_object_returns,
                    description="Description for link_object entity-level procedure"
                ),
                procedure_handlers.link_object
            )

            bucket.entity_procedure(
                "unlink_object",
                ProcedureDescription(
                    input_schema=procedure_handlers.unlink_object_takes,
                    output_schema=procedure_handlers.unlink_object_returns,
                    description="Description for unlink_object entity-level procedure"
                ),
                procedure_handlers.unlink_object
            )

            await sdk.register()
            papiea_test.USER_S2S_KEY = await create_user_s2s_key(sdk)
            return sdk
    except SecurityApiError as err:
            raise SecurityApiError.from_error(err, str(err))
    except:
        raise