import { getDifferLocationDataDescription } from "../../../papiea-engine/__tests__/test_data_factory"
import axios from "axios"
import { timeout } from "../../../papiea-engine/src/utils/utils"
import { IntentfulStatus, Version, Metadata } from "papiea-core"
import { ProviderSdk } from "../../src/provider_sdk/typescript_sdk";

declare var process: {
    env: {
        SERVER_PORT: string,
        PAPIEA_ADMIN_S2S_KEY: string,
    }
};
const serverPort = parseInt(process.env.SERVER_PORT || '3000');
const adminKey = process.env.PAPIEA_ADMIN_S2S_KEY || '';
const papieaUrl = 'http://127.0.0.1:3000';

const server_config = {
    host: "127.0.0.1",
    port: 9000
};

const entityApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/services`,
    timeout: 1000,
    headers: { 'Content-Type': 'application/json' }
});

const providerApiAdmin = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/provider`,
    timeout: 1000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
    }
});

describe("Intentful Workflow tests", () => {

    const locationDataDescription = getDifferLocationDataDescription()
    let provider_prefix: string
    let provider_version: Version = "0.1.0"
    let to_delete_entites: Metadata[] = []

    afterEach(async () => {
        for (let metadata of to_delete_entites) {
            await entityApi.delete(`${provider_prefix}/${provider_version}/${metadata.kind}/${metadata.uuid}`)
        }
        to_delete_entites = []
        await providerApiAdmin.delete(`${provider_prefix}/${provider_version}`)
    })

    test("Change single field differ resolver should pass", async () => {
        expect.assertions(2);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            provider_prefix = "location_provider_intentful_1"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(provider_prefix);
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
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            to_delete_entites.push(metadata)
            await timeout(5000)
            const { data: { task } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 20,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            let retries = 5
            try {
                for (let i = 1; i <= retries; i++) {
                    const res = await entityApi.get(`/intentful_task/${ task.uuid }`)
                    if (res.data.status === IntentfulStatus.Completed_Successfully) {
                        expect(res.data.status).toBe(IntentfulStatus.Completed_Successfully)
                        const result = await entityApi.get(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
                        expect(result.data.status.x).toEqual(20)
                        return
                    }
                    await timeout(5000)
                }
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
            }
        } finally {
            sdk.server.close();
        }
    })

    test("Change single field differ resolver should fail because of handler error", async () => {
        expect.assertions(2);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            provider_prefix = "location_provider_intentful_2"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(provider_prefix);
            location.on("x", {}, async (ctx, entity, input) => {
                throw new Error("Error in handler")
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 120,
                    y: 11
                }
            })
            to_delete_entites.push(metadata)
            await timeout(5000)
            const { data: { task } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 25,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            })
            let retries = 10
            try {
                for (let i = 1; i <= retries; i++) {
                    const res = await entityApi.get(`/intentful_task/${ task.uuid }`)
                    if (res.data.status === IntentfulStatus.Active && res.data.times_failed > 1) {
                        expect(res.data.times_failed).toBeGreaterThan(1)
                        expect(res.data.last_handler_error).toEqual("Error in handler")
                        return
                    }
                    await timeout(5000)
                }
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
            }
        } finally {
            sdk.server.close();
        }
    })

    test("Change single field differ resolver should fail because of CAS fail", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            provider_prefix = "location_provider_intentful_1"
            const location = sdk.new_kind(locationDataDescription);
            sdk.version(provider_version);
            sdk.prefix(provider_prefix);
            location.on("x", {}, async (ctx, entity, input) => {
                await providerApiAdmin.patch('/update_status', {
                    context: "some context",
                    entity_ref: {
                        uuid: metadata.uuid,
                        kind: kind_name
                    },
                    status: { x: entity.spec.x }
                })
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
            to_delete_entites.push(metadata)
            await timeout(5000)
            const { data: { task } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 20,
                    y: 11
                },
                metadata: {
                    spec_version: 0
                }
            })
            try {
                const res = await entityApi.get(`/intentful_task/${ task.uuid }`)
                if (res.data.status === IntentfulStatus.Failed) {
                    expect(res.data.status).toBe(IntentfulStatus.Failed)
                    return
                }
            } catch (e) {
                console.log(`Couldn't get entity: ${e}`)
            }
        } finally {
            sdk.server.close();
        }
    })
})