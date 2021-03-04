import "jest"
import { load } from "js-yaml";
import { resolve } from "path";
import { plural } from "pluralize"
import { loadYamlFromTestFactoryDir, OAuth2Server, ProviderBuilder } from "../../../../papiea-engine/__tests__/test_data_factory";
import { timeout } from "../../../../papiea-engine/src/utils/utils"
import axios from "axios"
import { readFileSync } from "fs";
import { Metadata, IntentfulBehaviour, Provider, Spec, Action, Entity_Reference, Entity, IntentfulStatus } from "papiea-core";
import { Logger, LoggerFactory } from "papiea-backend-utils";
import {kind_client, ProviderClient} from "papiea-client"
import { Kind_Builder, ProceduralCtx_Interface, ProviderSdk, SecurityApi } from "../../src/provider_sdk/typescript_sdk";
import { InvocationError } from "../../src/provider_sdk/typescript_sdk_exceptions"
import uuid = require("uuid");


declare var process: {
    env: {
        SERVER_PORT: string,
        PAPIEA_ADMIN_S2S_KEY: string
    }
};
const serverPort = parseInt(process.env.SERVER_PORT || '3000');
const adminKey = process.env.PAPIEA_ADMIN_S2S_KEY || '';
const papieaUrl = 'http://127.0.0.1:3000';

const server_config = {
    host: "127.0.0.1",
    port: 9000
};

const providerApiAdmin = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/provider`,
    timeout: 1000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
    }
});

const providerApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/provider`,
    timeout: 1000,
    headers: { 'Content-Type': 'application/json' }
});

const entityApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/services`,
    timeout: 1000,
    headers: { 'Content-Type': 'application/json' }
});

describe("Provider Sdk tests", () => {
    test("Pluralize works for 'test' & 'provider' words used", (done) => {
        expect(plural("test")).toBe("tests");
        expect(plural("provider")).toBe("providers");
        done();
    });
    const provider_version = "0.1.0";
    const location_yaml = load(readFileSync(resolve(__dirname, "../test_data/location_kind_test_data.yml"), "utf-8"));
    const location_array_yaml = load(readFileSync(resolve(__dirname, "../test_data/location_kind_test_data_array.yml"), "utf-8"));

    test("Yaml parses into walkable tree", (done) => {
        expect(location_yaml).not.toBeNull();
        expect(location_yaml.Location).not.toBeNull();
        done();
    });
    test("Yaml openapi spec-only model example contains valid structure", (done) => {
        expect(location_yaml.Location["x-papiea-entity"]).not.toBeUndefined();
        expect(location_yaml.Location["x-papiea-entity"]).toBe(IntentfulBehaviour.SpecOnly);
        expect(location_yaml.Location["properties"]).not.toBeUndefined();
        const props = location_yaml.Location["properties"];
        for (let prop in props) {
            if (props.hasOwnProperty(prop)) {
                expect(props[prop]["type"]).not.toBeUndefined();
            }
        }
        done();
    });
    test("Wrong yaml description causes error", (done) => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            sdk.new_kind({});
        } catch (err) {
            expect(err).not.toBeNull();
            sdk.cleanup()
            done();
        }
    });
    test("Provider can create a new kind", (done) => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location_manager = sdk.new_kind(location_yaml);
        expect(location_manager.kind.name).toBe("Location");
        sdk.cleanup()
        done();
    });
    test("Provider without version should fail to register", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            sdk.new_kind(location_yaml);
            sdk.prefix("test_provider");
            await sdk.register();
        } catch (err) {
            expect(err.message).toBe("Malformed provider description. Missing: version");
        }
        sdk.cleanup()
    });
    test("Provider without kind should fail to register", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            sdk.prefix("test_provider");
            sdk.version(provider_version);
            await sdk.register();
        } catch (err) {
            expect(err.message).toBe("Malformed provider description. Missing: kind");
        }
        sdk.cleanup()
    });
    test("Provider without prefix should fail to register", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            sdk.new_kind(location_yaml);
            sdk.version(provider_version);
            await sdk.register();
        } catch (err) {
            expect(err.message).toBe("Malformed provider description. Missing: prefix");
        }
        sdk.cleanup()
    });
    test("Add multiple kinds shouldn't fail", (done) => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const geo_location_yaml = JSON.parse(JSON.stringify(location_yaml));
        sdk.new_kind(location_yaml);
        sdk.new_kind(geo_location_yaml);
        sdk.cleanup()
        done();
    });
    let location_kind_manager: Kind_Builder;
    test("Duplicate delete on kind should return false", (done) => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        location_kind_manager = sdk.new_kind(location_yaml);
        expect(sdk.remove_kind(location_kind_manager.kind)).toBeTruthy();
        expect(sdk.remove_kind(location_kind_manager.kind)).toBeFalsy();
        sdk.cleanup()
        done();
    });
    test("Duplicate add on kind should return false", (done) => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        expect(sdk.add_kind(location_kind_manager.kind)).not.toBeNull();
        expect(sdk.add_kind(location_kind_manager.kind)).toBeNull();
        sdk.cleanup()
        done();
    });
    test("Provider should be created on papiea", async () => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        await sdk.register();
        sdk.cleanup()
    });
    test("Provider with procedures should be created on papiea", async () => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {
            entity.spec.x += input;
            const res = await axios.put(ctx.url_for(entity), {
                spec: entity.spec,
                metadata: entity.metadata
            });
            return res.data.spec;
        });
        try {
            await sdk.register();
        } finally {
            sdk.cleanup()
        }
    });
    test("Entity should be allowed to be modified using procedures defined using provider SDK", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            const location = sdk.new_kind(location_yaml);
            sdk.version(provider_version);
            sdk.prefix("location_provider");
            location.entity_procedure(
                "moveX",
                {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
                 output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
                async (ctx, entity, input) => {
                    entity.spec.x += input.x;
                    await axios.put(ctx.url_for(entity), {
                        spec: entity.spec,
                        metadata: entity.metadata
                    });
                    return entity.spec;
            });
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                spec: {
                    x: 10,
                    y: 11
                }
            });

            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}/procedure/moveX`, { x: 5 });
            const updatedEntity: any = await axios.get(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}`);
            expect(updatedEntity.data.metadata.spec_version).toEqual(2);
            expect(updatedEntity.data.spec.x).toEqual(15);
        } finally {
            sdk.cleanup()
        }
    });
    test("Invalid string input to the entity procedure should throw an error", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            const location = sdk.new_kind(location_yaml);
            sdk.version(provider_version);
            sdk.prefix("location_provider");
            location.entity_procedure(
                "moveX",
                {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
                 output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
                async (ctx, entity, input) => {
                    entity.spec.x += input.x;
                    await axios.put(ctx.url_for(entity), {
                        spec: entity.spec,
                        metadata: entity.metadata
                    });
                    return entity.spec;
            });
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                spec: {
                    x: 10,
                    y: 11
                }
            });

            await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}/procedure/moveX`, "5");
        } catch (err) {
            expect(err.response.data.error.errors[0].message).toEqual("Procedure was expecting non-empty object, received null/empty object for kind location_provider/0.1.0/Location")
        } finally {
            sdk.cleanup();
        }
    });
    test("Invalid numeric input to the entity procedure should throw an error", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            const location = sdk.new_kind(location_yaml);
            sdk.version(provider_version);
            sdk.prefix("location_provider");
            location.entity_procedure(
                "moveX",
                {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
                 output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
                async (ctx, entity, input) => {
                    entity.spec.x += input.x;
                    await axios.put(ctx.url_for(entity), {
                        spec: entity.spec,
                        metadata: entity.metadata
                    });
                    return entity.spec;
            });
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                spec: {
                    x: 10,
                    y: 11
                }
            });

            await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}/procedure/moveX`, 5);
        } catch (err) {
            expect(err).toBeDefined()
        } finally {
            sdk.cleanup();
        }
    });
    test("Malformed handler registered on sdk should fail", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {

            throw new Error("Malformed provider")

        });
        try {
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                spec: {
                    x: 10,
                    y: 11
                }
            });
            try {
                const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}/procedure/moveX`, { x: 5 });
            } catch (e) {
                expect(e).toBeDefined();
            }
        } finally {
            sdk.cleanup()
        }
    });

    test("Registering Provider procedures without prefix already set should fail", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        try {
            location.entity_procedure(
                "moveX",
                {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
                 output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
                async (ctx, entity, input) => {
                entity.spec.x += input;
                const res = await axios.put(ctx.url_for(entity), {
                    spec: entity.spec,
                    metadata: entity.metadata
                });
                return res.data.spec;
            });
            await sdk.register();
        } catch (e) {
            expect(e.message).toBe("Malformed provider description. Missing: prefix");
        }
        sdk.cleanup()
    });

    test("Provider with kind level procedures should be created on papiea", async () => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {
            entity.spec.x += input;
            const res = await axios.put(ctx.url_for(entity), {
                spec: entity.spec,
                metadata: entity.metadata
            });
            return res.data.spec;
        });
        location.kind_procedure(
            "computeGeolocation",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_geolocation_compute_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/procedure_geolocation_compute_input.yml")},
            async (ctx, input) => {
                let cluster_location = "us.west.";
                cluster_location += input;
                return cluster_location
            }
        );

        try {
            await sdk.register();
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with kind level procedures should be created on papiea", async () => {
        expect.hasAssertions()
        const kind_copy = JSON.parse(JSON.stringify(location_yaml))
        kind_copy["Location"]["x-papiea-entity"] = "basic"
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(kind_copy);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
            output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {
            entity.spec.x += input.x;
            await ctx.update_status(entity.metadata, {
                c: 15
            })
            return entity.spec;
        });
        try {
            await sdk.register();
            const kind_name = sdk.provider.kinds[ 0 ].name;
            const { data: { metadata, spec } } = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            });
            await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }/procedure/moveX`, { x: 5 });
        } catch(e) {
            expect(e).toBeDefined()
            expect(e.response.status).toEqual(400)
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with kind level procedures update status with nested object", async () => {
        expect.hasAssertions()
        const kind_copy = JSON.parse(JSON.stringify(location_yaml))
        kind_copy["Location"]["x-papiea-entity"] = "basic"
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(kind_copy);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
             output_schema:loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {
            entity.spec.v = {
                e: 15
            };
            await ctx.update_status(entity.metadata, {
                x: 10,
                y: 15,
                v: {
                    e: 15
                }
            })
            return entity.spec;
        });
        try {
            await sdk.register();
            const kind_name = sdk.provider.kinds[ 0 ].name;
            const { data: { metadata, spec } } = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            });
            await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }/procedure/moveX`, { x: 5 });
            const result = await entityApi.get(`${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
            expect(result.data.status.v.e).toEqual(15)
            await entityApi.delete(`${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with kind level procedures replace status with nested array of objects", async () => {
        expect.hasAssertions()
        const kind_copy = JSON.parse(JSON.stringify(location_array_yaml))
        kind_copy["Location"]["x-papiea-entity"] = "basic"
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(kind_copy);
        sdk.version(provider_version);
        sdk.prefix("location_provider_array_replace");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
             output_schema: kind_copy},
            async (ctx, entity, input) => {
            await ctx.update_status(entity.metadata, [{
                x: 10,
                y: 15,
                v: {
                    e: 15
                }
            }])
            return [{x: 10, y: 15}];
        });
        try {
            await sdk.register();
            const kind_name = sdk.provider.kinds[ 0 ].name;
            const { data: { metadata, spec } } = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: [{
                    x: 10,
                    y: 11
                }]
            });
            await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }/procedure/moveX`, { x: 5 });
            const result = await entityApi.get(`${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
            expect(result.data.status[0].v.e).toEqual(15)
            await entityApi.delete(`${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with kind level procedures replace status with nested object using update_status", async () => {
        expect.hasAssertions()
        const kind_copy = JSON.parse(JSON.stringify(location_yaml))
        kind_copy["Location"]["x-papiea-entity"] = "basic"
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(kind_copy);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {
            entity.spec.v = {
                e: 15
            };
            await ctx.update_status(entity.metadata, {
                x: 10,
                y: 15,
                v: {
                    e: 15
                }
            })
            return entity.spec;
        });
        try {
            await sdk.register();
            const kind_name = sdk.provider.kinds[ 0 ].name;
            const { data: { metadata, spec } } = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            });
            await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }/procedure/moveX`, { x: 5 });
            const result = await entityApi.get(`${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
            expect(result.data.status["v"]).toEqual({e: 15})
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with kind level procedures replace status with nested object using replace_status", async () => {
        expect.hasAssertions()
        const kind_copy = JSON.parse(JSON.stringify(location_yaml))
        kind_copy["Location"]["x-papiea-entity"] = "basic"
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(kind_copy);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {
            entity.spec.v = {
                e: 15
            };
            await ctx.replace_status(entity.metadata, {
                x: 10,
                y: 15,
                v: {
                    e: 15
                }
            })
            return entity.spec;
        });
        try {
            await sdk.register();
            const kind_name = sdk.provider.kinds[ 0 ].name;
            const { data: { metadata, spec } } = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            });
            await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }/procedure/moveX`, { x: 5 });
            const result = await entityApi.get(`${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name }/${ metadata.uuid }`)
            expect(result.data.status["v"]).toEqual({e: 15})
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with kind level procedures with error description and description should be registered", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider_description");
        location.kind_procedure(
            "computeGeolocation",
            {
                input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_geolocation_compute_input.yml"),
                output_schema: loadYamlFromTestFactoryDir("./test_data/procedure_geolocation_compute_input.yml"),
                description: "Sample procedure description for checking that description works",
                errors_schemas: {
                    "410": {
                        "description": `I am error 410!`,
                        "structure": {
                            "type": "object",
                            "properties": {
                                "sample_prop": {
                                    "type": "string"
                                }
                            }
                        }
                    }
                }
            }, async (ctx, input) => {
                let cluster_location = "us.west.";
                const some_error_condition = false
                if (some_error_condition) {
                    throw new InvocationError(410, "It is an error", [{
                        sample_prop: "It's an error :("
                    }])
                }
                cluster_location += input.region_id;
                return { "region_id": cluster_location }
            }
        );
        await sdk.register();
        const kind_name = sdk.provider.kinds[0].name;
        try {
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/procedure/computeGeolocation`, { region_id: "2" });
            expect(res.data.region_id).toBe("us.west.2");
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider error description fail validation", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider_description");
        expect(() => {
            location.kind_procedure(
                "computeGeolocation",
                {
                    input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_geolocation_compute_input.yml"),
                    output_schema: loadYamlFromTestFactoryDir("./test_data/procedure_geolocation_compute_input.yml"),
                    description: "Sample procedure description for checking that description works",
                    errors_schemas: {
                        "201": {
                            "description": `I am error 201 which isn't an error status!`,
                            "structure": {
                                "type": "object",
                                "properties": {
                                    "sample_prop": {
                                        "type": "string"
                                    }
                                }
                            }
                        }
                    }
                }, async (ctx, input) => {
                    let cluster_location = "us.west.";
                    const some_error_condition = false
                    if (some_error_condition) {
                        throw new InvocationError(201, "It is an error", [{
                            sample_prop: "It's an error :("
                        }])
                    }
                    cluster_location += input;
                    return cluster_location
                }
            );
        }).toThrow("Error description should feature status code in 4xx or 5xx")
        sdk.cleanup()
    });

    test("Provider with kind level procedures should be executed", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {
            entity.spec.x += input;
            const res = await axios.put(ctx.url_for(entity), {
                spec: entity.spec,
                metadata: entity.metadata
            });
            return res.data.spec;
        });
        location.kind_procedure(
            "computeGeolocation",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_geolocation_compute_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/procedure_geolocation_compute_input.yml")},
            async (ctx, input) => {
                let cluster_location = "us.west.";
                cluster_location += input.region_id;
                return { "region_id": cluster_location }
            }
        );
        await sdk.register();
        const kind_name = sdk.provider.kinds[0].name;
        try {
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/procedure/computeGeolocation`, { region_id: "2" });
            expect(res.data.region_id).toBe("us.west.2");
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with provider level procedures should be created on papiea", async () => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
            output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {
            entity.spec.x += input;
            const res = await axios.put(ctx.url_for(entity), {
                spec: entity.spec,
                metadata: entity.metadata
            });
            return res.data.spec;
        });
        sdk.provider_procedure(
            "computeSum",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_output.yml")},
            async (ctx, input) => {
                return input.a + input.b;
            }
        );
        try {
            await sdk.register();
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with provider level procedures should be executed", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {
            entity.spec.x += input;
            const res = await axios.put(ctx.url_for(entity), {
                spec: entity.spec,
                metadata: entity.metadata
            });
            return res.data.spec;
        });
        sdk.provider_procedure(
            "computeSum",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_output.yml")},
            async (ctx, input) => {
                return input.a + input.b;
            }
        );
        await sdk.register();
        try {
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeSum`, { "a": 5, "b": 5 });
            expect(res.data).toBe(10);
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with provider level procedures should fail validation if wrong type is returned", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider");
        location.entity_procedure(
            "moveX",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_move_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/location_kind_test_data.yml")},
            async (ctx, entity, input) => {
            entity.spec.x += input.x;
            const res = await axios.put(ctx.url_for(entity), {
                spec: entity.spec,
                metadata: entity.metadata
            });
            return res.data.spec;
        });
        sdk.provider_procedure(
            "computeSum",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_output.yml")},
            async (ctx, input) => {
                return "Totally not a number should fail provider-level validation";
            }
        );
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeSum`, { "a": 5, "b": 5 });
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toContain("Received procedure input field has type: string, schema expected type: number");
            expect(e.response.data.error.errors[0].stacktrace).not.toBeUndefined();
            expect(e.response.data.error.errors[0].stacktrace).toContain("Received procedure input field has type: string, schema expected type: number")
            expect(e.response.data.error.code).toBe(500);
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with provider level procedures should be allowed to be created without validation scheme", async () => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider_no_validation_scheme");
        sdk.provider_procedure("computeSumWithNoValidation",
            {},
            async (ctx, input) => {
            }
        );
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeSumWithNoValidation`, {});
        } finally {
            sdk.cleanup()
        }
    });

    test("Papiea should correctly validate if input param is an empty object", async () => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        const input_args = {type: 'object', properties: {}}
        sdk.version(provider_version);
        sdk.prefix("location_provider_empty_input");
        sdk.provider_procedure(
            "computeSumWithEmptyInput",
            {input_schema: {input: input_args}},
            async (ctx, input) => {
            }
        );
        try {
            await sdk.register();
            const res: any = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/procedure/computeSumWithEmptyInput`, {});
        } finally {
            sdk.cleanup()
        }
    });

    test("Papiea should correctly validate if input param is an empty object and schema doesn't have any required fields", async () => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        const input_args = {type: 'object', properties: { ip: { type: "string" }}}
        sdk.version(provider_version);
        sdk.prefix("location_provider_empty_input");
        sdk.provider_procedure(
            "computeSumWithEmptyInput",
            {input_schema: {input: input_args}},
            async (ctx, input) => {
            }
        );
        try {
            await sdk.register();
            const res: any = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/procedure/computeSumWithEmptyInput`, {});
        } finally {
            sdk.cleanup()
        }
    });

    test("Papiea should correctly validate if input schema is undefined and no input is sent", async() => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version)
        sdk.prefix("location_provider_undefined_input_schema_no_input")
        sdk.provider_procedure(
            "computeSumWithNoInput",
            {},
            async (ctx, input) => {
            }
        );
        try {
            await sdk.register();
            await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/procedure/computeSumWithNoInput`);
        } finally {
            sdk.cleanup();
        }
    });

    test("Papiea should fail validation if input schema is undefined and input value is set", async() => {
        expect.assertions(1)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version)
        sdk.prefix("location_provider_undefined_input_schema_input")
        sdk.provider_procedure(
            "computeSumWithInput",
            {},
            async (ctx, input) => {
            }
        );
        try {
            await sdk.register();
            await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/procedure/computeSumWithInput`, {'key': 'value'});
        } catch(e) {
            expect(e.response.data.error.errors[0].message).toEqual("Procedure was expecting type void, received non-empty object for kind location_provider_undefined_input_schema_input/0.1.0/ProviderProcedure")
        } finally {
            sdk.cleanup();
        }
    });

    test("Papiea should correctly validate if input schema is null and no input is sent", async() => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version)
        sdk.prefix("location_provider_null_input_schema_no_input")
        sdk.provider_procedure(
            "computeSumWithNoInput",
            {input_schema: null},
            async (ctx, input) => {
            }
        );
        try {
            await sdk.register();
            await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/procedure/computeSumWithNoInput`);
        } finally {
            sdk.cleanup();
        }
    });

    test("Papiea should fail validation if input schema is null and input value is set", async() => {
        expect.assertions(1)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version)
        sdk.prefix("location_provider_null_input_schema_input")
        sdk.provider_procedure(
            "computeSumWithInput",
            {input_schema: null},
            async (ctx, input) => {
            }
        );
        try {
            await sdk.register();
            await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/procedure/computeSumWithInput`, {'key': 'value'});
        } catch(e) {
            expect(e.response.data.error.errors[0].message).toEqual("Procedure was expecting type void, received non-empty object for kind location_provider_null_input_schema_input/0.1.0/ProviderProcedure")
        } finally {
            sdk.cleanup()
        }
    });

    test("Papiea should correclty validate if output param is an empty object", async () => {
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        const input_args = {type: 'object', properties: {}}
        sdk.version(provider_version);
        sdk.prefix("location_provider_empty_input_fail");
        sdk.provider_procedure(
            "computeSumWithEmptyOutput",
            {input_schema: {input: input_args},
             output_schema: {output: {}}},
            async (ctx, input) => {
            }
        );
        try {
            await sdk.register();
            const res: any = await axios.post(`${ sdk.entity_url }/${ sdk.provider.prefix }/${ sdk.provider.version }/procedure/computeSumWithEmptyOutput`, {});
        } catch(e) {
            expect(e.response.data.error.errors[0].message).toEqual("Procedure was expecting empty object, received non-empty object for kind location_provider_empty_input_fail/0.1.0/ProviderProcedure")
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with provider level procedures should return error if the return type is not void", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider_no_validation_scheme");
        sdk.provider_procedure("computeSumWithNoValidation",
            {},
            async (ctx, input) => {
                return "Totally not a void type"
            }
        );
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeSumWithNoValidation`, { "a": 5, "b": 5 });
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toEqual("Procedure was expecting type void, received non-empty object for kind location_provider_no_validation_scheme/0.1.0/ProviderProcedure");
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with provider level procedures throws error inside procedure", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider_throws_error");
        sdk.provider_procedure(
            "computeSumThrowsError",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_output.yml")},
            async (ctx, input) => {
                throw new Error("My custom error")
            }
        );
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeSumThrowsError`, { "a": 5, "b": 5 });
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toBe("My custom error");
            expect(e.response.data.error.errors[0].stacktrace).not.toBeUndefined();
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with provider level procedures should correctly handle exceptions in the provider", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider_throws_exception");
        sdk.provider_procedure(
            "computeSumThrowsError",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_output.yml")},
            async (ctx, input) => {
                const object: any = {}
                // This should raise exception
                object.undef.x = 10
            }
        );
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeSumThrowsError`, { "a": 5, "b": 5 });
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toBe("Cannot set property 'x' of undefined");
            expect(e.response.data.error.errors[0].stacktrace).not.toBeUndefined();
            expect(e.response.data.error.errors[0].stacktrace).toContain("TypeError: Cannot set property 'x' of undefined")
        } finally {
            sdk.cleanup()
        }
    });

    const NULL_TEST_SCHEMA = {
        Test: {
            type: 'object',
            title: 'Test',
            'x-papiea-entity': 'basic',
            properties: {
                provider_ref: {
                    type: 'object',
                    required: ['a_id'],
                    properties: {
                        a_id: {
                            type: 'string'
                        },
                        b_id: {
                            type: 'string'
                        }
                    }
                }
            }
        }
    }
    test("Entity initialization after setting it to null should succeed", async () => {
        expect.assertions(2);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            const machine = sdk.new_kind(NULL_TEST_SCHEMA);
            sdk.version(provider_version);
            sdk.prefix("test_provider");
            machine.entity_procedure(
                "testProcedure",
                {input_schema: {TestProcedureInput: {type: 'object', title: 'Input value to test procedure', required: ['b_id'], properties: {b_id: {type: 'string'}}}},
                 output_schema: NULL_TEST_SCHEMA},
                async (ctx, entity, input) => {

                const real_ref = {
                    a_id: '1',
                    b_id: input.b_id
                }
                await ctx.update_status(entity.metadata, {provider_ref: null})
                await ctx.update_status(entity.metadata, {provider_ref: real_ref})

                return entity.spec;
            });

            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                spec: {
                    provider_ref: {
                        a_id: '1',
                        b_id: '2'
                    }
                }
            });

            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}/procedure/testProcedure`, {b_id: '2'});
            const updatedEntity: any = await axios.get(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}`);
            expect(updatedEntity.data.status.provider_ref.a_id).toEqual('1')
            expect(updatedEntity.data.status.provider_ref.b_id).toEqual('2')
        } finally {
            sdk.cleanup()
        }
    });

    const NESTED_TEST_SCHEMA = {
        Test: {
            type: 'object',
            title: 'Test',
            'x-papiea-entity': 'differ',
            required: ['a'],
            properties: {
                a: {
                    type: 'object',
                    properties: {
                        b: {
                            type: 'object',
                        }
                    },
                },
            }
        }
    }

    test("Update status of a nested object with value of type any should succeed", async () => {
        expect.assertions(2)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            const nested_object = sdk.new_kind(NESTED_TEST_SCHEMA);
            sdk.version(provider_version);
            sdk.prefix("test_provider_update");
            nested_object.entity_procedure(
                "testProcedureUpdate",
                {input_schema: null,
                 output_schema: NESTED_TEST_SCHEMA},
                async (ctx, entity, input) => {

                    await ctx.update_status(entity.metadata, {
                        a: {
                            b: {
                                hyp_type: 'test'
                            }
                        }
                    });

                    return entity.spec;
            });

            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                spec: {
                    a: {
                        b: {
                            hyp_type: 'test'
                        }
                    }
                }
            });

            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}/procedure/testProcedureUpdate`);
            const updatedEntity: any = await axios.get(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}`);
            expect(updatedEntity.data.spec.a.b.hyp_type).toEqual('test')
            expect(updatedEntity.data.status.a.b.hyp_type).toEqual('test')
        } finally {
            sdk.cleanup();
        }
    });

    const STATUS_ONLY_TEST_SCHEMA = {
        TestObject: {
            type: 'object',
            title: 'testobject',
            'x-papiea-entity': 'differ',
            required: ['test'],
            properties: {
                test: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: {
                                type: 'string'
                            },
                            a: {
                                'x-papiea': 'status-only',
                                type: 'string'
                            },
                            b: {
                                type: 'string'
                            }
                        }
                    }
                }
            }
        }
    }

    const input_schema = {
        nested_object: {
            type: "object",
            properties: {
                test: {
                    type: "array"
                }
            }
        }
    }

    test("Diff resolver should not run if only diff field is a status-only field", async () => {
        expect.assertions(4)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        let called = false
        try {
            const nested_object = sdk.new_kind(STATUS_ONLY_TEST_SCHEMA);
            sdk.version(provider_version);
            sdk.prefix("test_provider_status_only_field");
            nested_object.on_create({input_schema}, async (ctx, input) => {
                return {
                    spec: {
                        test: input.test
                    },
                    status: {
                        test: []
                    }
                }
            })
            nested_object.on('test.+{id}', async(ctx, entity, diff) => {
                await ctx.update_status(entity.metadata, {
                    test: [{
                        id: 'test-idval',
                        a: 'test-aval',
                        b: 'test-aval'
                    }]
                })
            })
            nested_object.on('test.{id}', async (ctx, entity, diff) => {
                called = true
            });

            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                test: [
                    {
                        id: "test-idval",
                        b: "test-aval"
                    }
                ]
            }, {
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${adminKey}`
                }
            })

            await timeout(15000)

            const updatedEntity: any = await axios.get(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}`);
            expect(updatedEntity.data.spec.test[0].id).toEqual('test-idval')
            expect(updatedEntity.data.status.test[0].id).toEqual('test-idval')
            expect(updatedEntity.data.status.test[0].a).toEqual('test-aval')
            expect(called).toBeFalsy()
        } catch (e) {
            expect(e).toBeUndefined()
        } finally {
            sdk.cleanup()
        }
    })

    const NULL_FIELD_UPDATE_SCHEMA = {
        TestObject: {
            type: 'object',
            title: 'testobject',
            'x-papiea-entity': 'differ',
            properties: {
                test: {
                    type: 'string'
                }
            }
        }
    }

    test("Diff resolver should not run for field set to null in spec", async () => {
        expect.assertions(2);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            const test_kind = sdk.new_kind(NULL_FIELD_UPDATE_SCHEMA);
            sdk.version(provider_version);
            sdk.prefix("null_field_spec_diff_resolver");
            let called: boolean = false
            test_kind.on("test", async (ctx, input) => {
                console.log("Intent handler should not be invoked!!!")
                called = true
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                    spec: {
                        test: 'test-val1'
                    }
            }, {
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${adminKey}`,
                }
            });

            const updatedEntity: any = await axios.get(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}`);
            await axios.put(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}`, {
                spec: {
                    test: null
                },
                metadata: metadata
            });
            expect(updatedEntity.data.spec.test).toEqual("test-val1");
            expect(called).toBeFalsy()
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider with required status-only field should fail in registration", async () => {
        expect.assertions(1)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        let status_only_required_schema = JSON.parse(JSON.stringify(STATUS_ONLY_TEST_SCHEMA))
        status_only_required_schema.TestObject.properties.test.items.required = ['a']
        sdk.new_kind(status_only_required_schema);
        sdk.version(provider_version);
        sdk.prefix("status_only_required_provider");
        try {
            await sdk.register();
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toBe("Field: a of type 'status-only' is set to be required. Required fields cannot be 'status-only' for kind status_only_required_provider/0.1.0/TestObject")
        }
        sdk.cleanup()
    });

    test("Create entity spec with status-only field set should fail", async () => {
        expect.assertions(1)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const test_object = sdk.new_kind(STATUS_ONLY_TEST_SCHEMA);
        sdk.version(provider_version);
        sdk.prefix("test_status_only_field_update_spec");
        test_object.on_create({input_schema: STATUS_ONLY_TEST_SCHEMA}, async (ctx, input) => {
            return {
                spec: {
                    test: input.test
                },
                status: {
                    test: []
                }
            }
        })
        test_object.on('test.+{id}', async(ctx, entity, diff) => {
            await ctx.update_status(entity.metadata, {
                test: [{
                    id: 'test-idval',
                    a: 'test-aval',
                    b: 'test-aval'
                }]
            })
        })
        try {
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                test: [
                    {
                        id: "test-idval",
                        a: "test-aval",
                        b: "test-aval"
                    }
                ]
            }, {
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${adminKey}`
                }
            })
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toContain("On Create couldn't be called; Entity returned by the custom constructor of kind test_status_only_field_update_spec/0.1.0/TestObject is not valid due to errors: Received procedure input has additional field: 'a' not present in the schema")
        } finally {
            sdk.cleanup()
        }
    });

    test("Create entity spec with status-only field set and default input schema for constructor should fail", async () => {
        expect.assertions(5)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const test_object = sdk.new_kind(STATUS_ONLY_TEST_SCHEMA);
        sdk.version(provider_version);
        sdk.prefix("test_status_only_field_update_spec");
        test_object.on_create({}, async (ctx, input) => {
            return {
                spec: {
                    test: input.test
                },
                status: {
                    test: []
                }
            }
        })
        test_object.on('test.+{id}', async(ctx, entity, diff) => {
            await ctx.update_status(entity.metadata, {
                test: [{
                    id: 'test-idval',
                    a: 'test-aval',
                    b: 'test-aval'
                }]
            })
        })
        try {
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                test: [
                    {
                        id: "test-idval",
                        a: "test-aval",
                        b: "test-aval"
                    }
                ]
            }, {
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${adminKey}`
                }
            })
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toContain("On Create couldn't be called; Entity returned by the custom constructor of kind test_status_only_field_update_spec/0.1.0/TestObject is not valid due to errors: Received procedure input has additional field: 'a' not present in the schema")
            expect(e.response.data.error.entity_info.provider_prefix).toBe("test_status_only_field_update_spec")
            expect(e.response.data.error.entity_info.provider_version).toBe(provider_version)
            expect(e.response.data.error.entity_info.kind_name).toBe("TestObject")
            expect(e.response.data.error.entity_info.procedure_name).toBe("__TestObject_create")
        } finally {
            sdk.cleanup()
        }
    });

    test("Papiea version equal to the supported version should pass", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            const location = sdk.new_kind(location_yaml);
            sdk.version(provider_version);
            sdk.prefix("location_provider");
            location.on_create({input_schema: location_yaml}, async (ctx, input) => {
                return {
                    spec: input,
                    status: input
                }
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                    x: 10,
                    y: 11
            }, {
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${adminKey}`,
                  "Papiea-Version": sdk.get_sdk_version()
                }
            });

            const updatedEntity: any = await axios.get(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}`);
            expect(updatedEntity.data.spec.x).toEqual(10);
        } finally {
            sdk.cleanup()
        }
    });

    test("Papiea version compatible with the supported version should pass", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            const location = sdk.new_kind(location_yaml);
            sdk.version(provider_version);
            sdk.prefix("location_provider");
            location.on_create({input_schema: location_yaml}, async (ctx, input) => {
                return {
                    spec: input,
                    status: input
                }
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            let sdk_version_list = sdk.get_sdk_version().split('.')
            if (sdk_version_list[2] === '0') {
                sdk_version_list[2] = '1'
            } else {
                sdk_version_list[2] = (parseInt(sdk_version_list[2]) - 1).toString()
            }
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                    x: 10,
                    y: 11
            }, {
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${adminKey}`,
                  "Papiea-Version": sdk_version_list.join('.')
                }
            });

            const updatedEntity: any = await axios.get(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${metadata.uuid}`);
            expect(updatedEntity.data.spec.x).toEqual(10);
        } finally {
            sdk.cleanup()
        }
    });

    test("Papiea version incompatible with the supported version should fail", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        try {
            const location = sdk.new_kind(location_yaml);
            sdk.version(provider_version);
            sdk.prefix("location_provider");
            location.on_create({input_schema: location_yaml}, async (ctx, input) => {
                return {
                    spec: input,
                    status: input
                }
            })
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            let sdk_version_list = sdk.get_sdk_version().split('.')
            if (sdk_version_list[0] === '0') {
                sdk_version_list[0] = '1'
            } else {
                sdk_version_list[0] = (parseInt(sdk_version_list[0]) - 1).toString()
            }
            const { data: { metadata, spec } } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                    x: 10,
                    y: 11
            }, {
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${adminKey}`,
                  "Papiea-Version": sdk_version_list.join('.')
                }
            });
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toContain("Received incompatible papiea version")
        } finally {
            sdk.cleanup()
        }
    });
});

describe("SDK + oauth provider tests", () => {
    const oauth2ServerHost = '127.0.0.1';
    const oauth2ServerPort = 9002;
    const pathToModel: string = resolve(__dirname, "../test_data/provider_model_example.txt");
    const modelText: string = readFileSync(pathToModel).toString();
    const oauth = loadYamlFromTestFactoryDir("./test_data/auth.yaml");
    const provider_version = "0.1.0";
    const location_yaml = load(readFileSync(resolve(__dirname, "../test_data/location_kind_test_data.yml"), "utf-8"));
    const tenant_uuid = uuid();

    const provider: Provider = new ProviderBuilder()
        .withVersion("0.1.0")
        .withKinds()
        .withOAuth2Description()
        .withAuthModel()
        .build();
    const kind_name = provider.kinds[0].name;
    let entity_metadata: Metadata, entity_spec: Spec;
    const oauth2Server = OAuth2Server.createServer();
    const providerSDKTestLogger = LoggerFactory.makeLogger({level: "info", pretty_print: true});

    beforeAll(async () => {
        await providerApiAdmin.post('/', provider);
        oauth2Server.httpServer.listen(oauth2ServerPort, oauth2ServerHost, () => {
            providerSDKTestLogger.info(`Server running at http://${oauth2ServerHost}:${oauth2ServerPort}/`);
        });
        const { data: { metadata, spec } } = await entityApi.post(`/${ provider.prefix }/${ provider.version }/${ kind_name }`, {
            metadata: {
                extension: {
                    owner: "alice",
                    tenant_uuid: tenant_uuid
                }
            },
            spec: {
                x: 10,
                y: 11
            }
        });
        entity_metadata = metadata;
        entity_spec = spec;
    });

    afterAll(async () => {
        await entityApi.delete(`/${provider.prefix}/${provider.version}/${kind_name}/${entity_metadata.uuid}`);
        await providerApiAdmin.delete(`/${provider.prefix}/${provider.version}`);
        oauth2Server.httpServer.close();
    });


    test("Procedure check permission read should fail", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_read_fail");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([[Action.Read, { uuid: entity_metadata.uuid, kind: kind_name, provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version }]], undefined,  provider.prefix, provider.version);
                expect(allowed).toBeFalsy();
            }
        );
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, carol, owner, ${ kind_name }, *, allow`
        });
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Procedure check permission read should succeed", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_read_success");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([[Action.Read, { uuid: entity_metadata.uuid, kind: kind_name, provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version }]], undefined, provider.prefix, provider.version);
                expect(allowed).toBeTruthy();
            }
        );
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Procedure check permission read should succeed with specified user token", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_read_success_user_token");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([[Action.Read, { uuid: entity_metadata.uuid, kind: kind_name, provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version }]], adminKey, provider.prefix, provider.version);
                expect(allowed).toBeTruthy();
            }
        );
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Procedure check permission read should fail with specified invalid user token", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_read_fail_user_token");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([[Action.Read, { uuid: entity_metadata.uuid, kind: kind_name, provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version }]], "Totally invalid key", provider.prefix, provider.version);
                expect(allowed).toBeFalsy();
            }
        );
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Procedure check permission write should succeed", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_write_success");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([[Action.Create, { uuid: entity_metadata.uuid, kind: kind_name, spec_version: 1, extension: { owner: "alice" }, created_at: {} as Date, provider_prefix: provider.prefix, provider_version: provider.version } as Metadata]], undefined, provider.prefix, provider.version);
                expect(allowed).toBeTruthy();
            }
        );
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Procedure check permission write when read permission allowed should fail", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_write_success");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([[Action.Create, { uuid: entity_metadata.uuid, kind: kind_name, spec_version: 1, extension: { owner: "alice" }, created_at: {} as Date, provider_prefix: provider.prefix, provider_version: provider.version } as Metadata]], undefined, provider.prefix, provider.version);
                expect(allowed).toBeFalsy();
            }
        );
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, read, allow`
        });
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Procedure check permission write should fail", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_write_fail");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([[Action.Create, { uuid: entity_metadata.uuid, kind: kind_name, spec_version: 1, extension: { owner: "alice" }, created_at: {} as Date, provider_prefix: provider.prefix, provider_version: provider.version } as Metadata]], undefined, provider.prefix, provider.version);
                expect(allowed).toBeFalsy();
            }
        );
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, carol, owner, ${ kind_name }, *, allow`
        });
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Procedure check permission write with array should fail", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_write_fail");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([
                    [Action.Create, { uuid: entity_metadata.uuid, kind: kind_name, spec_version: 1, extension: { owner: "alice" }, created_at: {} as Date, provider_prefix: provider.prefix, provider_version: provider.version } as Metadata],
                    [Action.Create, { uuid: entity_metadata.uuid, kind: kind_name, spec_version: 1, extension: { owner: "jane" }, created_at: {} as Date, provider_prefix: provider.prefix, provider_version: provider.version } as Metadata]
                ], undefined, provider.prefix, provider.version);
                expect(allowed).toBeFalsy();
            }
        );
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Procedure check permission write with array should succeed", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_write_fail");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([
                    [Action.Create, { uuid: entity_metadata.uuid, kind: kind_name, spec_version: 1, extension: { owner: "alice" }, created_at: {} as Date, provider_prefix: provider.prefix, provider_version: provider.version } as Metadata],
                    [Action.Create, { uuid: entity_metadata.uuid, kind: kind_name, spec_version: 1, extension: { owner: "alice" }, created_at: {} as Date, provider_prefix: provider.prefix, provider_version: provider.version } as Metadata]
                ], undefined, provider.prefix, provider.version);
                expect(allowed).toBeTruthy();
            }
        );
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Procedure check permission write and read with array should succeed", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_write_fail");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([
                    [Action.Read, { uuid: entity_metadata.uuid, kind: kind_name, provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version }],
                    [Action.Create, { uuid: entity_metadata.uuid, kind: kind_name, spec_version: 1, extension: { owner: "alice" }, created_at: {} as Date, provider_prefix: provider.prefix, provider_version: provider.version } as Metadata]
                ], undefined, provider.prefix, provider.version);
                expect(allowed).toBeTruthy();
            }
        );
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Procedure check permission write and read with array should fail, read is denied", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("permissioned_provider_write_fail");
        sdk.provider_procedure(
            "computeWithPermissionCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const allowed = await ctx.check_permission([
                    [Action.Read, { uuid: entity_metadata.uuid, kind: kind_name, provider_prefix: entity_metadata.provider_prefix, provider_version: entity_metadata.provider_version }],
                    [Action.Create, { uuid: entity_metadata.uuid, kind: kind_name, spec_version: 1, extension: { owner: "alice" }, created_at: {} as Date, provider_prefix: provider.prefix, provider_version: provider.version } as Metadata]
                ], undefined, provider.prefix, provider.version);
                expect(allowed).toBeFalsy();
            }
        );
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, create, allow`
        });
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithPermissionCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } finally {
            sdk.cleanup()
            await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Provider with provider level procedures throws error inside procedure", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        sdk.version(provider_version);
        sdk.prefix("location_provider_throws_error_with_correct_description");
        sdk.provider_procedure(
            "computeWithErrorMessagePropagationCheck",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const token = ctx.get_invoking_token()
                const securityApi = ctx.get_user_security_api(token)
                let userInfo = await securityApi.user_info()
                const key = await ctx.get_provider_security_api().create_key({
                    name: "test",
                    owner: userInfo.owner,
                    user_info: {
                        provider_prefix: "test_provider"
                    }
                })
            }
        );
        sdk.secure_with(oauth, modelText, "xxx");
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        try {
            await sdk.register();
            await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/computeWithErrorMessagePropagationCheck`, { "a": 5, "b": 5 },
                { headers: { 'Authorization': `Bearer ${token}` }});
        } catch (e) {
            expect(e.response.data.error.errors[0].errors[0].message).toContain('provider_prefix should not be specified in the user info to create s2skey for provider')
        } finally {
            sdk.cleanup()
        }
    });

    const WATCHER_TEST_SCHEMA = {
        Location: {
            type: 'object',
            title: 'Location',
            'x-papiea-entity': 'differ',
            required: ['x', 'y'],
            properties: {
                x: {
                    type: 'number'
                },
                y: {
                    type: 'number'
                }
            }
        }
    }
    test("Intent watcher check permission read should succeed", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(WATCHER_TEST_SCHEMA);
        sdk.version(provider_version);
        sdk.prefix("permissioned_intent_watcher_read_succeed");
        location.on("x", async (ctx, entity, input) => {
            await providerApiAdmin.post(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                context: "some context",
                entity_ref: {
                    uuid: entity.metadata.uuid,
                    kind: entity.metadata.kind
                },
                status: {
                    x: 11,
                    y: 11
                }
            })
        })
        sdk.secure_with(oauth, modelText, "xxx");
        try {
            await sdk.register();
            const kind_name_local: string = sdk.provider.kinds[0].name
            await providerApiAdmin.post(`/${ sdk.provider.prefix }/${ sdk.provider.version }/auth`, {
                policy: `p, alice, owner, ${ kind_name_local }, *, allow`
            });
            const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
            const { data: { metadata, spec } } = await entityApi.post(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name_local }`, {
                metadata: {
                    extension: {
                        owner: "alice",
                        tenant_uuid: tenant_uuid
                    }
                },
                spec: {
                    x: 10,
                    y: 11
                }
            },
            { headers: { 'Authorization': `Bearer ${token}` }});
            const { data: { watcher } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name_local }/${ metadata.uuid }`, {
                spec: {
                    x: 11,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            },
            { headers: { 'Authorization': `Bearer ${token}` }})

            const watcherApi = sdk.get_intent_watcher_client()
            const intent_watcher = await watcherApi.get(watcher.uuid)
            expect(intent_watcher.status).toEqual(IntentfulStatus.Active)
        } finally {
            sdk.cleanup();
            await providerApiAdmin.post(`/${ sdk.provider.prefix }/${ sdk.provider.version }/auth`, {
                policy: null
            });
        }
    });

    test("Intent watcher check permission read should fail if owner is incorrect", async () => {
        expect.assertions(1);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(WATCHER_TEST_SCHEMA);
        sdk.version(provider_version);
        sdk.prefix("permissioned_intent_watcher_read_fail");
        location.on("x", async (ctx, entity, input) => {
            await providerApiAdmin.post(`/${sdk.provider.prefix}/${sdk.provider.version}/update_status`, {
                context: "some context",
                entity_ref: {
                    uuid: entity.metadata.uuid,
                    kind: entity.metadata.kind
                },
                status: {
                    x: 11,
                    y: 11
                }
            })
        })
        sdk.secure_with(oauth, modelText, "xxx");
        try {
            await sdk.register();
            const kind_name_local: string = sdk.provider.kinds[0].name
            // Use correct policy to create entity
            await providerApiAdmin.post(`/${sdk.provider.prefix}/${sdk.provider.version}/auth`, {
                policy: `p, carol, owner, ${kind_name_local}, *, allow`
            });
            const {data: {token}} = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
            const { data: { metadata, spec } } = await entityApi.post(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name_local }`, {
                metadata: {
                    extension: {
                        owner: "alice",
                        tenant_uuid: tenant_uuid
                    }
                },
                spec: {
                    x: 10,
                    y: 11
                }
            },
            { headers: { 'Authorization': `Bearer ${token}` }});
            const { data: { watcher } } = await entityApi.put(`/${ sdk.provider.prefix }/${ sdk.provider.version }/${ kind_name_local }/${ metadata.uuid }`, {
                spec: {
                    x: 11,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            },
            { headers: { 'Authorization': `Bearer ${token}` }})

            const watcherApi = sdk.get_intent_watcher_client()
            await watcherApi.get(watcher.uuid)
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toContain("Authorizer failed to execute")
        } finally {
            sdk.cleanup();
            await providerApiAdmin.post(`/${ sdk.provider.prefix }/${ sdk.provider.version }/auth`, {
                policy: null
            });
        }
    });
});

describe("SDK callback tests", () => {
    let provider: Provider
    const provider_version = "0.1.0";
    const location_yaml = load(readFileSync(resolve(__dirname, "../test_data/location_kind_test_data_callback.yml"), "utf-8"));
    let location_yaml_duplicate = load(readFileSync(resolve(__dirname, "../test_data/location_kind_test_data_callback.yml"), "utf-8"));
    location_yaml_duplicate["Location1"] = JSON.parse(JSON.stringify(location_yaml_duplicate["Location"]))
    delete location_yaml_duplicate["Location"]
    let kind_name: string
    let prefix: string

    afterEach(async () => {
        await providerApiAdmin.delete(`/${prefix}/${provider_version}`);
    });

    test("On delete callback should be called", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_delete_callback"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        sdk.provider_procedure(
            "computeWithDeleteCallback",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
            }
        );
        location.on_delete(async (ctx, input) => {
            expect(input).toBeDefined()
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const {data: {metadata}} = await entityApi.post(`/${prefix}/${provider_version}/${kind_name}`, {
                spec: {
                    x: 10,
                    y: 11
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${ adminKey }`
                }
            })
            await entityApi.delete(`/${ prefix }/${ provider_version }/${ kind_name }/${ metadata.uuid }`, {
                headers: {
                    'Authorization': `Bearer ${adminKey}`
                }
            })
        } finally {
            sdk.cleanup()
        }
    });

    test("On create callback should be called", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_create_callback"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        sdk.provider_procedure(
            "computeWithCreateCallback",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
            }
        );
        location.on_create({input_schema: location_yaml}, async (ctx, input) => {
            expect(input).toBeDefined()
            return {
                spec: input,
                status: input
            }
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const {data: {metadata}} = await entityApi.post(
                `/${prefix}/${provider_version}/${kind_name}`,
                {
                    x: 10,
                    y: 11
                },
                {
                    headers: {
                        "Authorization": `Bearer ${adminKey}`
                    }
                }
            )
            await entityApi.delete(`/${prefix}/${provider_version}/${kind_name}/${metadata.uuid}`, {
                headers: {
                    "Authorization": `Bearer ${adminKey}`
                }
            })
        } finally {
            sdk.cleanup()
        }
    });

    test("On create should reject request when user is not defined", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_create_callback_auth"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        location.on_create({input_schema: location_yaml}, async (ctx, input) => {
            // Shouldn't reach
            return {
                spec: input,
                status: input
            }
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const {data: {metadata}} = await entityApi.post(
                `/${prefix}/${provider_version}/${kind_name}`,
                {
                    x: 10,
                    y: 11
                }
            )
        } catch (e) {
            expect(e.response.status).toEqual(401)
        } finally {
            sdk.cleanup()
        }
    });

    test("On create should use the kind structure if input schema is missing and succeed", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_create_no_input_schema_callback"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        sdk.provider_procedure(
            "computeWithCreateCallback",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
            }
        );
        location.on_create({}, async (ctx, input) => {
            expect(input).toBeDefined()
            return {
                spec: input,
                status: input
            }
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const {data: {metadata}} = await entityApi.post(
                `/${prefix}/${provider_version}/${kind_name}`,
                {
                    x: 10,
                    y: 11
                },
                {
                    headers: {
                        "Authorization": `Bearer ${adminKey}`
                    }
                }
            )
            await entityApi.delete(`/${prefix}/${provider_version}/${kind_name}/${metadata.uuid}`, {
                headers: {
                    "Authorization": `Bearer ${adminKey}`
                }
            })
        } finally {
            sdk.cleanup()
        }
    });

    test("On create callback with invalid constructor input should fail validation", async () => {
        expect.assertions(2);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_create_callback_invalid_constructor_input"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        location.on_create({input_schema: location_yaml}, async (ctx, input) => {
            expect(input).toBeDefined()
            return {
                spec: input,
                status: input
            }
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const {data: {metadata}} = await entityApi.post(
                `/${prefix}/${provider_version}/${kind_name}`,
                {
                    x: 10,
                    y: 11,
                    v: 4
                },
                {
                    headers: {
                        "Authorization": `Bearer ${adminKey}`
                    }
                }
            )
            await entityApi.delete(`/${prefix}/${provider_version}/${kind_name}/${metadata.uuid}`, {
                headers: {
                    "Authorization": `Bearer ${adminKey}`
                }
            })
        } catch (err) {
            expect(err.response.data.error.code).toBe(400)
            expect(err.response.data.error.errors[0].message).toContain("Received procedure input field: v has type: number, schema expected type object for kind provider_on_create_callback_invalid_constructor_input/0.1.0/Location")
        }finally {
            sdk.cleanup()
        }
    });

    test("On create callback with invalid constructor return entity should fail", async () => {
        expect.assertions(2);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_create_callback_invalid_constructor_return_entity"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        location.on_create({input_schema: location_yaml}, async (ctx, input) => {
            return {
                spec: { x: input.x },
                status: input
            }
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const {data: {metadata}} = await entityApi.post(
                `/${prefix}/${provider_version}/${kind_name}`,
                {
                    x: 10,
                    y: 11
                },
                {
                    headers: {
                        "Authorization": `Bearer ${adminKey}`
                    }
                }
            )
            await entityApi.delete(`/${prefix}/${provider_version}/${kind_name}/${metadata.uuid}`, {
                headers: {
                    "Authorization": `Bearer ${adminKey}`
                }
            })
        } catch (err) {
            expect(err.response.data.error.code).toBe(500)
            expect(err.response.data.error.errors[0].message).toContain("On Create couldn't be called; Entity returned by the custom constructor of kind provider_on_create_callback_invalid_constructor_return_entity/0.1.0/Location is not valid due to errors: Received procedure input is missing required field: y")
        }finally {
            sdk.cleanup()
        }
    });

    test("Engine should reject incorrect entity creation format (constructor format for example)", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        sdk.new_kind(location_yaml);
        prefix = "constructor_format_provider"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        try {
            await sdk.register();
            const kind_name = sdk.provider.kinds[0].name;
            const {
                data: {
                    metadata,
                    spec
                }
            } = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}`, {
                x: 10,
                y: 11
            }, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${adminKey}`,
                }
            });
        } catch (e) {
            expect(e.response.data.error.errors[0].message).toContain(`Spec is missing for entity`)
        } finally {
            sdk.cleanup()
        }
    });

    test("Client should use appropriate request format when on create callback is present", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_create_callback_schema"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        sdk.provider_procedure(
            "computeWithCreateCallback",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
            }
        );
        location.on_create({input_schema: location_yaml}, async (ctx, input) => {
            expect(input).toBeDefined()
            return {
                spec: input,
                status: input
            }
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const client = await kind_client(papieaUrl, prefix, kind_name, provider_version, adminKey)
            const entity = await client.create({x: 10, y: 11})
            await entityApi.delete(`/${prefix}/${provider_version}/${kind_name}/${entity.metadata.uuid}`, {
                headers: {
                    "Authorization": `Bearer ${adminKey}`
                }
            })
            client.close()
        } finally {
            sdk.cleanup()
        }
    });

    test("Client should use appropriate request format when on create callback is NOT present", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_create_callback_schema_1"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        sdk.provider_procedure(
            "computeWithCreateCallback",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
            }
        );
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const client = await kind_client(papieaUrl, prefix, kind_name, provider_version, adminKey)
            const entity = await client.create({spec: {x: 10, y: 11}})
            await entityApi.delete(`/${prefix}/${provider_version}/${kind_name}/${entity.metadata.uuid}`, {
                headers: {
                    "Authorization": `Bearer ${adminKey}`
                }
            })
            expect(entity.status.x).toEqual(10)
            client.close()
        } finally {
            sdk.cleanup()
        }
    });

    const constructor_input_schema = {
        Input: {
            type: "object",
            properties: {
                x: {
                    type: "number"
                },
                y: {
                    type: "number"
                },
                uuid: {
                    type: "string"
                }
            }
        }
    }

    test("Entity is deleted if on create failed", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_create_callback"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        location.on_create({input_schema: constructor_input_schema}, async (ctx, input) => {
            throw new Error("Constructor failed")
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[ 0 ].name
            const id = uuid()
            try {
                const { data: { metadata } } = await entityApi.post(`/${ prefix }/${ provider_version }/${ kind_name }`, {
                    x: 10,
                    y: 11,
                    uuid: id
                }, {
                    headers: {
                        "Authorization": `Bearer ${ adminKey }`
                    }
                })
            } catch (e) {}
            try {
                await entityApi.get(`/${ prefix }/${ provider_version }/${ kind_name }/${ id }`, {
                    headers: {
                        "Authorization": `Bearer ${ adminKey }`
                    }
                })
            } catch (e) {
                expect(e).toBeDefined()
            }
        } finally {
            sdk.cleanup()
        }
    });

    test("On create callback shouldn't be called twice if entity is already created", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_create_callback_twice"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        let called_times = 0
        location.on_create({input_schema: constructor_input_schema}, async (ctx, input) => {
            called_times++
            return {
                spec: {
                    x: input.x,
                    y: input.y
                },
                status: {
                    x: input.x,
                    y: input.y
                },
                metadata: {
                    uuid: input.uuid
                }
            }
        })
        try {
            const id = uuid()
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const { data: { metadata } } = await entityApi.post(`/${ prefix }/${ provider_version }/${ kind_name }`, {
                x: 10,
                y: 11,
                uuid: id
            }, {
                headers: {
                    'Authorization': `Bearer ${ adminKey }`
                }
            })
            try {
                await entityApi.post(`/${ prefix }/${ provider_version }/${ kind_name }`, {
                    spec: {
                        x: 10,
                        y: 11
                    },
                    metadata: {
                        uuid: id
                    }
                }, {
                    headers: {
                        'Authorization': `Bearer ${ adminKey }`
                    }
                })
            } catch (e) {

            }
            await entityApi.delete(`/${ prefix }/${ provider_version }/${ kind_name }/${ metadata.uuid }`, {
                headers: {
                    'Authorization': `Bearer ${ adminKey }`
                }
            })
            expect(called_times).toEqual(1)
        } finally {
            sdk.cleanup()
        }
    });

    test("On create 2 callbacks for different kinds should be called", async () => {
        expect.assertions(2)
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        const location_duplicate = sdk.new_kind(location_yaml_duplicate);
        prefix = "provider_on_create_2_callbacks"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        location.on_create({input_schema: constructor_input_schema}, async (ctx, input) => {
            expect(input).toBeDefined()
            return {
                spec: input,
                status: input
            }
        })
        location_duplicate.on_create({input_schema: constructor_input_schema}, async (ctx, input) => {
            expect(input).toBeDefined()
            return {
                spec: input,
                status: input
            }
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const duplicate_kind_name = sdk.provider.kinds[1].name
            const { data: { metadata } } = await entityApi.post(`/${ prefix }/${ provider_version }/${ kind_name }`, {
                x: 10,
                y: 11
            }, {
                headers: {
                    'Authorization': `Bearer ${ adminKey }`
                }
            })
            const result = await entityApi.post(`/${ prefix }/${ provider_version }/${ duplicate_kind_name }`, {
                x: 10,
                y: 11
            }, {
                headers: {
                    'Authorization': `Bearer ${ adminKey }`
                }
            })
            await entityApi.delete(`/${ prefix }/${ provider_version }/${ kind_name }/${ metadata.uuid }`, {
                headers: {
                    'Authorization': `Bearer ${ adminKey }`
                }
            })
            await entityApi.delete(`/${ prefix }/${ provider_version }/${ duplicate_kind_name }/${ result.data.metadata.uuid }`, {
                headers: {
                    'Authorization': `Bearer ${ adminKey }`
                }
            })
        } finally {
            sdk.cleanup()
        }
    });

    test("On delete and on create callbacks should be called", async () => {
        expect.assertions(2);
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_delete_on_create_callback"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        sdk.provider_procedure(
            "computeWithDeleteCreateCallbacks",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
            }
        );
        location.on_delete(async (ctx, input) => {
            expect(input).toBeDefined()
        })

        location.on_create({input_schema: constructor_input_schema}, async (ctx, input) => {
            expect(input).toBeDefined()
            return {
                spec: input,
                status: input
            }
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const { data: { metadata } } = await entityApi.post(`/${ prefix }/${ provider_version }/${ kind_name }`, {
                x: 10,
                y: 11
            }, {
                headers: {
                    'Authorization': `Bearer ${ adminKey }`
                }
            })
            await entityApi.delete(`/${ prefix }/${ provider_version }/${ kind_name }/${ metadata.uuid }`, {
                headers: {
                    'Authorization': `Bearer ${ adminKey }`
                }
            })
        } finally {
            sdk.cleanup()
        }
    })

    test("On delete callback with error should interrupt execution", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_delete_callback"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        location.on_delete(async (ctx, input) => {
            throw new Error("Cannot invoke on delete")
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            const { data: { metadata } } = await entityApi.post(`/${ prefix }/${ provider_version }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${ adminKey }`
                }
            })
            try {
                await entityApi.delete(`/${prefix}/${provider_version}/${kind_name}/${metadata.uuid}`, {
                    headers: {
                        'Authorization': `Bearer ${adminKey}`
                    }
                })
            } catch (e) {
                expect(e.response.data).toBeDefined()
                expect(e.response.data.error.errors[0].message).toBe("On Delete couldn't be called; Cannot invoke on delete")
            }
        } finally {
            sdk.cleanup()
        }
    });

    test("On create callback with error should interrupt execution", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_on_create_callback"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        sdk.provider_procedure(
            "computeWithCreateCallback",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
            }
        );
        location.on_create({input_schema: constructor_input_schema}, async (ctx, input) => {
            throw new Error("Cannot invoke on create")
        })
        try {
            await sdk.register()
            kind_name = sdk.provider.kinds[0].name
            try {
                const { data: { metadata } } = await entityApi.post(`/${ prefix }/${ provider_version }/${ kind_name }`, {
                    x: 10,
                    y: 11
                }, {
                    headers: {
                        'Authorization': `Bearer ${adminKey}`
                    }
                })
            } catch (e) {
                expect(e.response.data).toBeDefined()
                expect(e.response.data.error.errors[0].message).toBe("On Create couldn't be called; Cannot invoke on create")
            }
        } finally {
            sdk.cleanup()
        }
    });
});

describe("SDK client tests", () => {
    const provider_version = "0.1.0";
    const location_yaml = load(readFileSync(resolve(__dirname, "../test_data/location_kind_test_data_callback.yml"), "utf-8"));
    let prefix: string

    afterEach(async () => {
        await providerApiAdmin.delete(`/${prefix}/${provider_version}`);
    });

    test("Procedure should get client", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_with_client"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        sdk.provider_procedure(
            "compute",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml")},
            async (ctx, input) => {
                const client = ctx.get_provider_client()
                expect(client).toBeDefined()
                client.close()
            }
        );
        try {
            await sdk.register();
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/procedure/compute`, { "a": 5, "b": 5 })
        } finally {
            sdk.cleanup()
        }
    });

    test("Provider gets client and uses it", async () => {
        expect.hasAssertions();
        const sdk = ProviderSdk.create_provider(papieaUrl, adminKey, server_config.host, server_config.port);
        const location = sdk.new_kind(location_yaml);
        prefix = "provider_with_client_kind"
        sdk.version(provider_version);
        sdk.prefix(prefix);
        let uuid: string = "123"
        location.kind_procedure(
            "computeGeolocation",
            {input_schema: loadYamlFromTestFactoryDir("./test_data/procedure_geolocation_compute_input.yml"),
             output_schema: loadYamlFromTestFactoryDir("./test_data/procedure_geolocation_compute_input.yml")},
                async (ctx, input) => {
                const client = await ctx.get_provider_client(adminKey)
                const kind_client = await client.get_kind(location.kind.name)
                const entity_spec = await kind_client.create({spec: {
                    x: 100,
                    y: 150
                }})
                uuid = entity_spec.metadata.uuid
                let cluster_location = "us.west.";
                cluster_location += input.region_id;
                kind_client.close()
                client.close()
                return { "region_id": cluster_location }
            }
        );
        await sdk.register();
        const kind_name = sdk.provider.kinds[0].name;
        try {
            const res: any = await axios.post(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/procedure/computeGeolocation`, { region_id: "2" });
            expect(res.data.region_id).toBe("us.west.2");
            const entity_created = await axios.get(`${sdk.entity_url}/${sdk.provider.prefix}/${sdk.provider.version}/${kind_name}/${uuid}`)
            expect(entity_created.data.spec.x).toEqual(100)
        } finally {
            sdk.cleanup()
        }
    });

});

class MockProceduralCtx implements ProceduralCtx_Interface {

    public static create(provider_client_func: (key?: string) => ProviderClient): MockProceduralCtx {
        const mock = new MockProceduralCtx()
        mock.get_provider_client = provider_client_func
        return mock
    }

    update_status(entity_reference: Entity_Reference, status: any): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    replace_status(entity_reference: Entity_Reference, status: any): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    update_progress(message: string, done_percent: number): boolean {
        throw new Error("Method not implemented.");
    }
    url_for(entity: Entity): string {
        throw new Error("Method not implemented.");
    }
    get_provider_security_api(): SecurityApi {
        throw new Error("Method not implemented.");
    }
    get_user_security_api(user_s2skey: string): SecurityApi {
        throw new Error("Method not implemented.");
    }
    get_headers(): import("http").IncomingHttpHeaders {
        throw new Error("Method not implemented.");
    }
    get_invoking_token(): string {
        throw new Error("Method not implemented.");
    }
    check_permission(entityAction: [Action, Entity_Reference][], user_token?: string, provider_prefix?: string, provider_version?: string): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
    get_logger(log_level?: string, pretty_print?: boolean): Logger {
        throw new Error("Method not implemented.");
    }
    get_provider_client(key?: string): ProviderClient {
        throw new Error("Method not implemented.");
    }
    cleanup() {
    }
}


describe("SDK client mock", () => {
    test("Provider mocks client", async () => {
        expect.hasAssertions();
        const location_procedure = async (ctx: ProceduralCtx_Interface, input: any) => {
            const client = await ctx.get_provider_client('test_key')
            let cluster_location = "us.west.";
            cluster_location += input;
            return cluster_location
        }
        const mock_ctx = MockProceduralCtx.create(key => {
            return {} as ProviderClient
        })
        const res = await location_procedure(mock_ctx, "2")
        expect(res).toEqual("us.west.2")
    });
})
