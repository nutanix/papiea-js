import { KindBuilder, ProviderBuilder } from "../test_data_factory"
import axios from "axios"
import uuid = require("uuid");
import { IntentfulBehaviour } from "papiea-core";

declare var process: {
    env: {
        SERVER_PORT: string,
        PAPIEA_ADMIN_S2S_KEY: string
    }
};
const serverPort = parseInt(process.env.SERVER_PORT || '3000');
const adminKey = process.env.PAPIEA_ADMIN_S2S_KEY || '';

const entityApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/services`,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' }
});

const providerApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/provider/`,
    timeout: 1000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
    }
});

describe("Uuid validation tests", () => {
    const providerPrefix = uuid();
    const providerVersion = "0.1.0";
    let kind_name: string
    const specOnlyEntityKind = new KindBuilder(IntentfulBehaviour.SpecOnly).build()
    specOnlyEntityKind.uuid_validation_pattern = "^a*$"

    beforeAll(async () => {
        const provider = new ProviderBuilder(providerPrefix).withVersion(providerVersion).withKinds([specOnlyEntityKind]).build();
        kind_name = provider.kinds[0].name;
        await providerApi.post('/', provider);
    });

    afterAll(async () => {
        await providerApi.delete(`${providerPrefix}/${providerVersion}`);
    });

    test("Uuid should validate if validation pattern is set", async () => {
        const { data: { metadata, spec } } = await entityApi.post(`${providerPrefix}/${providerVersion}/${kind_name}`, {
            spec: {
                x: 105,
                y: 11
            },
            metadata: {
                uuid: "a"
            }
        })
        expect(metadata.uuid).toBe("a")
        await entityApi.delete(`${providerPrefix}/${providerVersion}/${kind_name}/${metadata.uuid}`)
    })

    test("Uuid shouldn't validate if validation pattern is set and uuid is not correct", async () => {
        try {
            const { data: { metadata, spec } } = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: "b"
                }
            })
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toBe(`Entity UUID does not match the pattern`)
        }
    })

    test("Uuid should be unique", async () => {
        const { data: { metadata, spec } } = await entityApi.post(`${providerPrefix}/${providerVersion}/${kind_name}`, {
            spec: {
                x: 150,
                y: 11
            },
            metadata: {
                uuid: "aa"
            }
        })
        try {
            await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: "aa"
                }
            })
        } catch (e) {
            expect(e.response.data.error.message).toContain("Conflicting Entity")
        }
        await entityApi.delete(`${providerPrefix}/${providerVersion}/${kind_name}/${metadata.uuid}`)
    })

    test("Uuid should be provided if there is a pattern specified", async () => {
        try {
            const { data: { metadata, spec } } = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            })
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toBe(`Metadata uuid is undefined but kind ${providerPrefix}/${providerVersion}/${kind_name} has validation pattern set`)
        }
    })
});
