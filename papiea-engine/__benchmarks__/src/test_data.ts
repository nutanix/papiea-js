import axios from "axios";
import { ProviderSdk } from "papiea-sdk/build/provider_sdk/typescript_sdk";
import {
    getDifferLocationDataDescription,
    getLocationDataDescription,
    loadYaml
} from "../../__tests__/test_data_factory";
import { Procedural_Execution_Strategy, Provider } from "papiea-core";

const adminKey = process.env.PAPIEA_ADMIN_S2S_KEY || '';
const args = process.argv
const PAPIEA_URL = args[2]

const providerApiAdmin = axios.create({
    baseURL: `${PAPIEA_URL}/provider`,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
    }
});

const provider_version = "0.1.0"
const provider_prefix = "benchmark_provider"
const intentful_provider_prefix = "benchmark_intentful_provider"
const location_desc = getLocationDataDescription()
const location_differ_desc = getDifferLocationDataDescription()

function tryParsePort(portStr: string): number {
    let port: number
    try {
        port = parseInt(portStr)
        return port
    } catch (e) {
        throw new Error("Port must be a number")
    }
}

export async function setUpTestProvider(papiea_url: string, public_host: string, public_port: string): Promise<Provider> {
    const sdk = ProviderSdk.create_provider(papiea_url, adminKey, public_host, tryParsePort(public_port));
    const location = sdk.new_kind(location_desc);
    sdk.version(provider_version);
    sdk.prefix(provider_prefix);
    location.entity_procedure("moveX", {}, Procedural_Execution_Strategy.Halt_Intentful, loadYaml("../__tests__/test_data/procedure_move_input.yml"), loadYaml("../__tests__/test_data/location_kind_test_data.yml"), async (ctx, entity, input) => {
        entity.spec.x += input;
        return entity.spec;
    });
    location.kind_procedure(
        "computeGeolocation",
        {}, Procedural_Execution_Strategy.Halt_Intentful,
        loadYaml("../__tests__/test_data/procedure_geolocation_compute_input.yml"),
        loadYaml("../__tests__/test_data/procedure_geolocation_compute_input.yml"), async (ctx, input) => {
            let cluster_location = "us.west.";
            cluster_location += input;
            return cluster_location
        }
    );
    sdk.provider_procedure("computeSum",
        {},
        Procedural_Execution_Strategy.Halt_Intentful,
        loadYaml("../__tests__/test_data/procedure_sum_input.yml"),
        loadYaml("../__tests__/test_data/procedure_sum_output.yml"),
        async (ctx, input) => {
            return input.a + input.b;
        }
    );
    try {
        await sdk.register();
    } catch (e) {
        console.log("Error setting provider")
        throw e
    }
    return sdk.provider
}

export async function setUpTestIntentfulProvider(papiea_url: string, public_host: string, public_port: string): Promise<Provider> {
    const sdk = ProviderSdk.create_provider(papiea_url, adminKey, public_host, tryParsePort(public_port));
    const location = sdk.new_kind(location_differ_desc);
    sdk.version(provider_version);
    sdk.prefix(intentful_provider_prefix);
    location.on("x", {}, async (ctx, entity, input) => {
        await providerApiAdmin.patch('/update_status', {
            context: "some context",
            entity_ref: {
                uuid: entity.metadata.uuid,
                kind: entity.metadata.kind
            },
            status: { x: entity.spec.x }
        })
    })
    try {
        await sdk.register();
    } catch (e) {
        console.log("Error setting provider")
        throw e
    }
    return sdk.provider
}

export async function cleanUpTestProvider(provider: Provider) {
    await providerApiAdmin.delete(`/${provider.prefix}/${provider.version}`);
}