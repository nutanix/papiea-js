import { kind_client } from "../src/entity_client"
import { ProviderBuilder } from "../../papiea-engine/__tests__/test_data_factory"
import axios from "axios"
import { Spec } from "papiea-core"

declare var process: {
    env: {
        SERVER_PORT: string,
        PAPIEA_ADMIN_S2S_KEY: string
    }
};
const serverPort = parseInt(process.env.SERVER_PORT || '3000');
const adminKey = process.env.PAPIEA_ADMIN_S2S_KEY || '';

const providerApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/provider/`,
    timeout: 1000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
    }
});

describe("Entity API tests", () => {
    const providerPrefix = "location_provider_iter_test";
    const providerVersion = "0.0.3";
    let kind_name: string
    beforeAll(async () => {
        const provider = new ProviderBuilder(providerPrefix).withVersion(providerVersion).withOAuth2Description().withKinds().build();
        kind_name = provider.kinds[0].name;
        await providerApi.post('/', provider);
    });

    afterAll(async () => {
        await providerApi.delete(`${providerPrefix}/${providerVersion}`);
    });
    test("Filtering via async iterators should work correctly", async () => {
        const uuids: string[] = []
        const location_client = kind_client("http://localhost:3000", providerPrefix, kind_name, providerVersion, '')
        let promises = []
        const specs = [1,2,3,4]
        for (let i of specs) {
            promises.push(location_client.create({spec: {x: i, y: i}}))
        }
        const res = await Promise.all<Spec>(promises)
        res.map(entity => uuids.push(entity.metadata.uuid))
        let entity_count = 0
        const iterator = await location_client.filter_iter({})
        for await (const entity of iterator()) {
            console.log(entity.spec)
            expect(specs).toContain(entity.spec.x)
            entity_count++
        }
        expect(entity_count).toBe(4)
        promises = []
        for (const uuid of uuids) {
            promises.push(location_client.delete({uuid, kind: kind_name}))
        }
        await Promise.all(promises)
        location_client.close()
    })

    test("Filtering via async iterators with batch size should work correctly", async () => {
        const uuids: string[] = []
        const location_client = kind_client("http://localhost:3000", providerPrefix, kind_name, providerVersion, '')
        let promises = []
        const specs = [1,2,3,4]
        for (let i of specs) {
            promises.push(location_client.create({spec: {x: i, y: i}}))
        }
        const res = await Promise.all<Spec>(promises)
        res.map(entity => uuids.push(entity.metadata.uuid))
        let entity_count = 0
        const iterator = await location_client.filter_iter({})
        for await (const entity of iterator(2)) {
            expect(specs).toContain(entity.spec.x)
            entity_count++
        }
        expect(entity_count).toBe(4)
        promises = []
        for (const uuid of uuids) {
            promises.push(location_client.delete({uuid, kind: kind_name}))
        }
        await Promise.all(promises)
        location_client.close()
    })

    test("List async iterators should work correctly", async () => {
        const uuids: string[] = []
        const location_client = kind_client("http://localhost:3000", providerPrefix, kind_name, providerVersion, '')
        let promises = []
        const specs = [1,2,3,4]
        for (let i of specs) {
            promises.push(location_client.create({spec: {x: i, y: i}}))
        }
        const res = await Promise.all<Spec>(promises)
        res.map(entity => uuids.push(entity.metadata.uuid))
        let entity_count = 0
        const iterator = await location_client.list_iter()
        for await (const entity of iterator(2)) {
            expect(specs).toContain(entity.spec.x)
            entity_count++
        }
        expect(entity_count).toBe(4)
        promises = []
        for (const uuid of uuids) {
            promises.push(location_client.delete({uuid, kind: kind_name}))
        }
        await Promise.all(promises)
        location_client.close()
    })
})
