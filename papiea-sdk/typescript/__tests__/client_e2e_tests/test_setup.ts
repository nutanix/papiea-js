import axios from "axios"
import { readFileSync } from "fs";
import { load } from "js-yaml";
import { resolve } from "path";
import { kind_client } from "papiea-client"
import { ProviderSdk } from "../../src/provider_sdk/typescript_sdk";
import * as procedures from "./procedure_handlers"
import * as utils from "./utils"

const config = require("./config")

const provider_prefix = "e2e_test_provider"
const provider_version = "0.1.0"

const metadata_extension = load(readFileSync(resolve(__dirname, "./security/metadata_extension.yml"), "utf-8"));

const bucket_yaml = load(readFileSync(resolve(__dirname, "./kinds/bucket_kind.yml"), "utf-8"));

const object_yaml = load(readFileSync(resolve(__dirname, "./kinds/object_kind.yml"), "utf-8"));
object_yaml["object"]["properties"]["references"]["items"]["properties"]["bucket_reference"] =
    utils.get_kind_ref_type(config.bucket, "Reference of the bucket in which the object exists")

let test_provider: ProviderSdk

const provider_api_admin = axios.create({
    baseURL: `http://${ config.server_host }:${ config.papiea_server_port }/provider`,
    timeout: 1000,
    headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ config.admin_s2s_key }`
    }
});

export function get_client(kind: string) {
    return kind_client(config.papiea_url, provider_prefix, kind, provider_version, config.admin_s2s_key)
}

export async function setup_and_register_sdk() {
    try {
        test_provider = ProviderSdk.create_provider(config.papiea_url, config.admin_s2s_key, config.server_host, config.server_port)
        test_provider.prefix(provider_prefix).version(provider_version)

        test_provider.metadata_extension(metadata_extension)

        const bucket_kind = test_provider.new_kind(bucket_yaml)
        const object_kind = test_provider.new_kind(object_yaml)

        bucket_kind.on_create({input_schema: {
            Bucket: {
                properties: {
                    name: {
                        type: "string"
                    },
                    objects: {
                        type: "array"
                    },
                    owner: {
                        type: "string"
                    }
                }
            }
        }}, procedures.bucket_create_handler);

        object_kind.on_create({input_schema: {
            Object: {
                properties: {
                    content: {
                        type: "string",
                    },
                    owner: {
                        type: "string"
                    }
                }
            }
        }}, procedures.object_create_handler);

        bucket_kind.on("name", procedures.bucket_name_handler);
        bucket_kind.on("objects.+{name}", procedures.on_object_added_handler)
        bucket_kind.on("objects.-{name}", procedures.on_object_removed_handler)

        object_kind.on("content", procedures.object_content_handler)

        bucket_kind.kind_procedure(
            "ensure_bucket_exists",
            {input_schema: procedures.ensure_bucket_exists_takes,
            output_schema: procedures.ensure_bucket_exists_returns,
            description: "Description for ensure_bucket_exists kind-level procedure"
            },
            procedures.ensure_bucket_exists
        )

        bucket_kind.entity_procedure(
            "change_bucket_name",
            {input_schema: procedures.change_bucket_name_takes,
            output_schema: procedures.change_bucket_name_returns,
            description: "Description for change_bucket_name entity-level procedure"
            },
            procedures.change_bucket_name
        )

        bucket_kind.entity_procedure(
            "create_object",
            {input_schema: procedures.create_object_takes,
            output_schema: procedures.create_object_returns,
            description: "Description for create_object entity-level procedure"
            },
            procedures.create_object
        )

        bucket_kind.entity_procedure(
            "link_object",
            {input_schema: procedures.link_object_takes,
            output_schema: procedures.link_object_returns,
            description: "Description for link_object entity-level procedure"
            },
            procedures.link_object
        )

        bucket_kind.entity_procedure(
            "unlink_object",
            {input_schema: procedures.unlink_object_takes,
            output_schema: procedures.unlink_object_returns,
            description: "Description for create_object entity-level procedure"
            },
            procedures.unlink_object
        )

        await test_provider.register()
    } catch (err) {
        utils.logger.debug("Failed to setup/register the sdk")
    }
}

export async function cleanup_sdk() {
    try {
        test_provider.cleanup();
        await provider_api_admin.delete(`/${provider_prefix}/${provider_version}`);
    } catch (err) {
        utils.logger.debug("Failed to cleanup the tests")
    }
}

export function get_intent_watcher_client() {
    return test_provider.get_intent_watcher_client()
}