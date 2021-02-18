import "jest"
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { validate } from "swagger-parser";
import axios from "axios"
import {
    DescriptionBuilder, KindBuilder,
    loadYamlFromTestFactoryDir,
    ProviderBuilder
} from "../test_data_factory"
import { Provider_DB } from "../../src/databases/provider_db_interface";
import {
    FieldBehavior,
    IntentfulBehaviour,
    Kind,
    Procedural_Execution_Strategy,
    Procedural_Signature,
    Provider,
    Version
} from "papiea-core";
import ApiDocsGenerator from "../../src/api_docs/api_docs_generator";
import { IntentfulKindReference } from "../../src/databases/provider_db_mongo";
import { strict } from "assert";

declare var process: {
    env: {
        SERVER_PORT: string,
    }
};
const serverPort = parseInt(process.env.SERVER_PORT || '3000');
const api = axios.create({
    baseURL: `http://127.0.0.1:${ serverPort }/`,
    timeout: 1000,
    headers: { 'Content-Type': 'application/json' }
});

type prefix = string
class Provider_DB_Mock implements Provider_DB {
    provider: Provider
    providerMap: Map<prefix, Provider> = new Map()

    constructor(provider?: Provider) {
        if (provider === undefined) {
            const provider = new ProviderBuilder().withVersion("0.1.0").withKinds().build();
            this.provider = provider
            this.providerMap.set(provider.prefix, provider)
        } else {
            this.provider = provider
            this.providerMap.set(provider.prefix, provider)
        }
    }

    async save_provider(provider: Provider): Promise<void> {
        this.providerMap.set(provider.prefix, provider)
    }

    async get_provider(provider_prefix: string, version?: Version): Promise<Provider> {
        return this.providerMap.get(provider_prefix)!;
    }

    async list_providers(): Promise<Provider[]> {
        const providers = []
        // @ts-ignore
        for (const provider of this.providerMap.values()) {
            providers.push(provider)
        }
        return providers
    }

    async delete_provider(provider_prefix: string, version: Version): Promise<void> {

    }

    async get_latest_provider_by_kind(kind_name: string): Promise<Provider> {
        throw new Error("Not implemented")
    }

    async find_providers(provider_prefix: string): Promise<Provider[]> {
        throw new Error("Not implemented")
    }

    async get_latest_provider(provider_prefix: string): Promise<Provider> {
        throw new Error("Not implemented")
    }

    find_kind(provider: Provider, kind_name: string): Kind {
        throw new Error("Not implemented")
    }

    get_intentful_kinds(): Promise<IntentfulKindReference[]> {
        throw new Error("Not implemented")
    }
}

describe("API Docs Tests", () => {

    const providerDbMock = new Provider_DB_Mock();
    const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
    test("Validate API Docs agains OpenAPI spec", async () => {
        expect.hasAssertions();
        try {
            const apiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider);
            const apiDocJson = JSON.stringify(apiDoc);
            writeFileSync("api-docs.json", apiDocJson);
            const api = await validate("api-docs.json");
            expect(api.info.title).toEqual("Swagger Papiea");
        } finally {
            unlinkSync("api-docs.json");
        }
    });
    test("Test duplicate required field in OpenAPI schema", async () => {
        expect.assertions(1)
        try {
            const apiDocJson = JSON.parse(readFileSync("__tests__/test_data/customschema_swagger.json", {encoding:'utf8'}))
            apiDocJson["paths"]["/services/0.1.0/object"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["properties"]["results"]["items"]["required"].push("spec")
            writeFileSync("customschema_duplicatefield_swagger.json", JSON.stringify(apiDocJson))
            await validate("customschema_duplicatefield_swagger.json");
        } catch (e) {
            expect(e.message).toContain("Array items are not unique")
        } finally {
            unlinkSync("customschema_duplicatefield_swagger.json")
        }
    });
    test("Test wrong field in OpenAPI schema", async () => {
        expect.assertions(1)
        try {
            const apiDocJson = JSON.parse(readFileSync("__tests__/test_data/customschema_swagger.json", {encoding:'utf8'}))
            delete apiDocJson["paths"]["/services/0.1.0/object"]["get"]["description"]
            apiDocJson["paths"]["/services/0.1.0/object"]["get"]["decription"] = "description"
            writeFileSync("customschema_wrongspell_swagger.json", JSON.stringify(apiDocJson))
            await validate("customschema_wrongspell_swagger.json");
        } catch (e) {
            expect(e.message).toContain("Additional properties not allowed: decription")
        } finally {
            unlinkSync("customschema_wrongspell_swagger.json")
        }
    });
    test("Test empty required field in OpenAPI schema", async () => {
        expect.assertions(1)
        try {
            const apiDocJson = JSON.parse(readFileSync("__tests__/test_data/customschema_swagger.json", {encoding:'utf8'}))
            apiDocJson["paths"]["/services/0.1.0/object"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["properties"]["results"]["items"]["required"] = []
            writeFileSync("customschema_emptyrequired_swagger.json", JSON.stringify(apiDocJson))
            await validate("customschema_emptyrequired_swagger.json");
        } catch (e) {
            expect(e.message).toContain("Array is too short (0), minimum 1 at #/required")
        } finally {
            unlinkSync("customschema_emptyrequired_swagger.json")
        }
    });
    test("Test missing required field in OpenAPI schema", async () => {
        expect.assertions(1)
        try {
            const apiDocJson = JSON.parse(readFileSync("__tests__/test_data/customschema_swagger.json", {encoding:'utf8'}))
            delete apiDocJson["info"]["title"]
            writeFileSync("customschema_missingrequiredfield_swagger.json", JSON.stringify(apiDocJson))
            await validate("customschema_missingrequiredfield_swagger.json");
        } catch (e) {
            expect(e.message).toContain("Missing required property: title at #/info")
        } finally {
            unlinkSync("customschema_missingrequiredfield_swagger.json")
        }
    });
    test("API Docs should contain paths for CRUD", async () => {
        expect.hasAssertions();
        const providerPrefix = providerDbMock.provider.prefix;
        const entityName = providerDbMock.provider.kinds[0].name;
        const providerVersion = providerDbMock.provider.version;
        const apiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider);
        expect(Object.keys(apiDoc.paths)).toContain(`/services/${ providerPrefix }/${ providerVersion }/${ entityName }`);
        const kindPath = apiDoc.paths[`/services/${ providerPrefix }/${ providerVersion }/${ entityName }`];
        expect(Object.keys(kindPath)).toContain("get");
        expect(Object.keys(kindPath)).toContain("post");
        expect(Object.keys(apiDoc.paths)).toContain(`/services/${ providerPrefix }/${ providerVersion }/${ entityName }/{uuid}`);
        const kindEntityPath = apiDoc.paths[`/services/${ providerPrefix }/${ providerVersion }/${ entityName }/{uuid}`];
        expect(Object.keys(kindEntityPath)).toContain("get");
        expect(Object.keys(kindEntityPath)).toContain("delete");
        expect(Object.keys(kindEntityPath)).toContain("put");
    });
    test("API Docs should contain Location scheme", async () => {
        expect.hasAssertions();
        const apiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider);
        const entityName = providerDbMock.provider.kinds[0].name;
        expect(Object.keys(apiDoc.components.schemas)).toContain(`${entityName}-Spec`);
        expect(Object.keys(apiDoc.components.schemas)).toContain(`${entityName}-Status`);
        const entitySchemaSpec = apiDoc.components.schemas[`${entityName}-Spec`];
        expect(entitySchemaSpec).toEqual({
            "type": "object",
            "title": "X\/Y Location",
            "description": "Stores an XY location of something",
            "x-papiea-entity": "spec-only",
            "required": ["x", "y"],
            "properties": {
                "x": {
                    "type": "number"
                },
                "y": {
                    "type": "number",
                },
                "v": {
                    "type": "object",
                    "properties": {
                        "d": {
                            "type": "number"
                        },
                        "e": {
                            "type": "number"
                        }
                    }
                }
            }
        });
        const entitySchemaStatus = apiDoc.components.schemas[`${entityName}-Status`];
        expect(entitySchemaStatus).toEqual({
            "type": "object",
            "title": "X\/Y Location",
            "description": "Stores an XY location of something",
            "x-papiea-entity": "spec-only",
            "required": ["x", "y"],
            "properties": {
                "x": {
                    "type": "number"
                },
                "y": {
                    "type": "number"
                },
                "v": {
                    "type": "object",
                    "properties": {
                        "d": {
                            "type": "number"
                        },
                        "e": {
                            "type": "number"
                        }
                    }
                }
            }
        });
    });
    test("API Docs should be accessible by the url", done => {
        api.get("/api-docs").then(() => done()).catch(done.fail);
    });
});

describe("API docs test entity", () => {
    test("Provider with procedures generates correct openAPI spec", async () => {
        expect.hasAssertions();
        const procedure_id = "computeSumWithValidation";
        const proceduralSignatureForProvider: Procedural_Signature = {
            name: "computeSumWithValidation",
            argument: loadYamlFromTestFactoryDir("./test_data/procedure_sum_input.yml"),
            result: loadYamlFromTestFactoryDir("./test_data/procedure_sum_output.yml"),
            execution_strategy: Procedural_Execution_Strategy.Halt_Intentful,
            procedure_callback: "127.0.0.1:9011",
            base_callback: "127.0.0.1:9011"
        };
        const provider: Provider = new ProviderBuilder("provider_with_validation_scheme")
            .withVersion("0.1.0")
            .withKinds()
            .withCallback(`http://127.0.0.1:9010`)
            .withProviderProcedures({ [procedure_id]: proceduralSignatureForProvider })
            .withKindProcedures()
            .withEntityProcedures()
            .build();
        const providerDbMock = new Provider_DB_Mock(provider);
        const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
        const apiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider);

        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/procedure/${ procedure_id }`]
            .post
            .requestBody
            .content["application/json"]
            .schema['$ref']).toEqual(`#/components/schemas/provider_with_validation_scheme-0.1.0-computeSumWithValidation-SumInput`);

        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/procedure/${ procedure_id }`]
            .post
            .responses["200"]
            .content["application/json"]
            .schema["$ref"]).toEqual(`#/components/schemas/provider_with_validation_scheme-0.1.0-computeSumWithValidation-SumOutput`);

        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/procedure/${ procedure_id }`]
            .post
            .responses["default"]
            .content["application/json"]
            .schema["$ref"]).toEqual(`#/components/schemas/Error`);

        expect(apiDoc.components.schemas["Error"]).toEqual({
            "required": [
                "error",
            ],
            "properties": {
                "error": {
                    "type": "object",
                    "required": [
                        "errors",
                        "code",
                        "message"
                    ],
                    "properties": {
                        "errors": {
                            "type": "array",
                            "items": {
                                "type": "object"
                            }
                        },
                        "code": {
                            "type": "integer"
                        },
                        "message": {
                            "type": "string"
                        },
                        "type": {
                            "type": "string"
                        }
                    }
                }
            }
        })
    });

    test("Provider with procedures generates correct openAPI spec when an object has multiple keys", async () => {
        expect.hasAssertions();
        const procedure_id_anon = "computeSumWithValidationAnonymous";
        const proceduralSignatureForProviderAnon: Procedural_Signature = {
            name: "computeSumWithValidationAnonymous",
            argument: {
                "type": "object",
                "properties": {
                    "sum": {
                        "type": "number"
                    }
                }
            },
            result: {
                "type": "object",
                "properties": {
                    "sum": {
                        "type": "number"
                    }
                }
            },
            execution_strategy: Procedural_Execution_Strategy.Halt_Intentful,
            procedure_callback: "127.0.0.1:9011",
            base_callback: "127.0.0.1:9011"
        };
        const provider: Provider = new ProviderBuilder("provider_with_validation_scheme")
            .withVersion("0.1.0")
            .withKinds()
            .withCallback(`http://127.0.0.1:9010`)
            .withProviderProcedures({ [procedure_id_anon]: proceduralSignatureForProviderAnon })
            .withKindProcedures()
            .withEntityProcedures()
            .build();
        const providerDbMock = new Provider_DB_Mock(provider);
        const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
        const apiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider);

        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/procedure/${ procedure_id_anon }`]
                   .post
                   .requestBody
                   .content["application/json"]
                   .schema['$ref']).toEqual(`#/components/schemas/provider_with_validation_scheme-0.1.0-computeSumWithValidationAnonymous-Input`);

        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/procedure/${ procedure_id_anon }`]
                   .post
                   .responses["200"]
                   .content["application/json"]
                   .schema["$ref"]).toEqual(`#/components/schemas/provider_with_validation_scheme-0.1.0-computeSumWithValidationAnonymous-Output`);

        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/procedure/${ procedure_id_anon }`]
                   .post
                   .responses["default"]
                   .content["application/json"]
                   .schema["$ref"]).toEqual(`#/components/schemas/Error`);
    });

    test("Provider with procedures generates correct openAPI emitting all variables without 'x-papiea' - 'status_only' property", async () => {
        expect.hasAssertions();
        const kind = new KindBuilder(IntentfulBehaviour.Basic).build()
        const provider = new ProviderBuilder("provider_include_all_props").withVersion("0.1.0").withKinds([kind]).build();
        const providerDbMock = new Provider_DB_Mock(provider);
        const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
        const kind_name = provider.kinds[0].name;

        const apiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider);
        const entityName = kind_name + "-Spec";
        expect(Object.keys(apiDoc.components.schemas)).toContain(entityName);
        const entitySchema = apiDoc.components.schemas[entityName];
        expect(entitySchema).toEqual({
            "type": "object",
            "title": "X\/Y Location",
            "description": "Stores an XY location of something",
            "x-papiea-entity": "basic",
            "required": ["x", "y"],
            "properties": {
                "x": {
                    "type": "number"
                },
                "y": {
                    "type": "number"
                },
                "v": {
                    "type": "object",
                    "properties": {
                        "d": {
                            "type": "number"
                        },
                        "e": {
                            "type": "number"
                        }
                    }
                }
            }
        });
    });

    test("Provider with procedures generates correct openAPI removing all variables with 'x-papiea' - 'status_only' from properties and required of a spec", async () => {
        expect.hasAssertions()
        let desc = new DescriptionBuilder()
        // add 'z' to required field, so that we check it gets removed from required and fields
        desc = desc.withStatusOnlyField("z", "number").withRequiredField("z")
        desc = desc.build()
        const kind = new KindBuilder(IntentfulBehaviour.Basic).withDescription(desc).build()
        const provider = new ProviderBuilder("provider_include_all_props").withVersion("0.1.0").withKinds([kind]).build()
        const providerDbMock = new Provider_DB_Mock(provider)
        const apiDocsGenerator = new ApiDocsGenerator(providerDbMock)
        const kind_name = provider.kinds[0].name
        const structure = provider.kinds[0].kind_structure[kind_name]

        // add required fields to v that are marked as status-only so that we check recursive deletion works
        structure.properties.v.required = ["h"]
        structure.properties.v.properties["h"] = {"type": "number", "x-papiea": FieldBehavior.StatusOnly}


        const apiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider)
        const entityName = kind_name + "-Spec"
        expect(Object.keys(apiDoc.components.schemas)).toContain(entityName)
        const entitySchema = apiDoc.components.schemas[entityName]
        expect(entitySchema).toEqual({
            "type": "object",
            "title": "X\/Y Location",
            "description": "Stores an XY location of something",
            "x-papiea-entity": "basic",
            "required": ["x", "y"],
            "properties": {
                "x": {
                    "type": "number"
                },
                "y": {
                    "type": "number"
                },
                "v": {
                    "type": "object",
                    "properties": {
                        "d": {
                            "type": "number"
                        },
                        "e": {
                            "type": "number"
                        }
                    }
                }
            }
        })
    })

    test("Provider with procedures that have no validation generate correct open api docs", async () => {
        expect.hasAssertions();
        const procedure_id = "computeSumNoValidation";
        const proceduralSignatureForProvider: Procedural_Signature = {
            name: "computeSumNoValidation",
            argument: {},
            result: {},
            execution_strategy: Procedural_Execution_Strategy.Halt_Intentful,
            procedure_callback: "127.0.0.1:9011",
            base_callback: "127.0.0.1:9011"
        };
        const provider: Provider = new ProviderBuilder("provider_no_validation_scheme")
            .withVersion("0.1.0")
            .withKinds()
            .withCallback(`http://127.0.0.1:9010`)
            .withProviderProcedures({ [procedure_id]: proceduralSignatureForProvider })
            .withKindProcedures()
            .withEntityProcedures()
            .build();
        const providerDbMock = new Provider_DB_Mock(provider);
        const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
        const apiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider);

        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/procedure/${ procedure_id }`]
            .post
            .requestBody
            .content["application/json"]
            .schema['$ref']).toEqual(`#/components/schemas/Nothing`);

        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/procedure/${ procedure_id }`]
            .post
            .responses["200"]
            .content["application/json"]
            .schema["$ref"]).toEqual(`#/components/schemas/Nothing`);
    });

    test("Providers with same procedure names and different spec should work correctly", async () => {
        expect.hasAssertions();
        const firstDescription = {
            Input: {
                type: "object",
                properties: {
                    x: {
                        type: "string"
                    },
                    y: {
                        type: "string"
                    }
                }
            }
        }
        const firstProvider: Provider = new ProviderBuilder("provider_same_kind_1")
            .withVersion("0.1.0")
            .withKinds([new KindBuilder(IntentfulBehaviour.SpecOnly).withDescription(firstDescription).build()])
            .build();

        const secondDescription = {
            Input: {
                type: "object",
                properties: {
                    a: {
                        type: "string"
                    },
                    b: {
                        type: "string"
                    }
                }
            }
        }
        const secondProvider: Provider = new ProviderBuilder("provider_same_kind_1")
            .withVersion("0.1.0")
            .withKinds([new KindBuilder(IntentfulBehaviour.SpecOnly).withDescription(secondDescription).build()])
            .build();
        const providerDbMock = new Provider_DB_Mock(firstProvider);
        await providerDbMock.save_provider(secondProvider)
        const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
        const firstApiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider);
        expect(firstApiDoc.components.schemas["Input"]).toEqual(
            {
                type: "object",
                "x-papiea-entity": "spec-only",
                properties: {
                    x: {
                        type: "string"
                    },
                    y: {
                        type: "string"
                    }
                }
            }
        )
        const secondApiDoc = await apiDocsGenerator.getApiDocs(await providerDbMock.get_provider(secondProvider.prefix))
        expect(secondApiDoc.components.schemas["Input"]).toEqual(
            {
                type: "object",
                "x-papiea-entity": "spec-only",
                properties: {
                    a: {
                        type: "string"
                    },
                    b: {
                        type: "string"
                    }
                }
            }
        )
    });

    test("Provider kinds with same description names should be different", async () => {
        expect.hasAssertions();
        const firstDescription = {
            InputOne: {
                type: "object",
                properties: {
                    x: {
                        type: "string"
                    },
                    y: {
                        type: "string"
                    }
                }
            }
        }
        const secondDescription = {
            InputTwo: {
                type: "object",
                properties: {
                    a: {
                        type: "string"
                    },
                    b: {
                        type: "string"
                    }
                }
            }
        }
        const provider: Provider = new ProviderBuilder("provider_same_kind_1")
            .withVersion("0.1.0")
            .withKinds(
                [
                    new KindBuilder(IntentfulBehaviour.SpecOnly).withDescription(firstDescription).build(),
                    new KindBuilder(IntentfulBehaviour.SpecOnly).withDescription(secondDescription).build(),
                ]
            )
            .build();
        const firstProcDesc: Procedural_Signature = {
            name: "Desc",
            argument: firstDescription,
            result: firstDescription,
            execution_strategy: Procedural_Execution_Strategy.Halt_Intentful,
            procedure_callback: "",
            base_callback: ""
        };
        const secondProcDesc: Procedural_Signature = {
            name: "Desc",
            argument: secondDescription,
            result: secondDescription,
            execution_strategy: Procedural_Execution_Strategy.Halt_Intentful,
            procedure_callback: "",
            base_callback: ""
        };
        provider.kinds[0].kind_procedures["Desc"] = firstProcDesc
        provider.kinds[1].kind_procedures["Desc"] = JSON.parse(JSON.stringify(firstProcDesc))
        const providerDbMock = new Provider_DB_Mock(provider);
        const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
        const apiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider);
        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/${provider.kinds[0].name}/procedure/Desc`]
                   .post
                   .responses["200"]
                   .content["application/json"]
                   .schema["$ref"]).toEqual(`#/components/schemas/provider_same_kind_1-0.1.0-InputOne-Desc-InputOne`);
        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/${provider.kinds[1].name}/procedure/Desc`]
                   .post
                   .responses["200"]
                   .content["application/json"]
                   .schema["$ref"]).toEqual(`#/components/schemas/provider_same_kind_1-0.1.0-InputTwo-Desc-InputOne`);
    });
    test("Provider kinds with entity constructors should generate correct open api docs", async () => {
        expect.hasAssertions();
        const provider: Provider = new ProviderBuilder("provider_kind_with_entity_constructor")
            .withVersion("0.1.0")
            .withKinds()
            .withEntityConstructor()
            .build();
        const providerDbMock = new Provider_DB_Mock(provider);
        const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
        const apiDoc = await apiDocsGenerator.getApiDocs(providerDbMock.provider);
        const kind_name = provider.kinds[0].name;

        // #/components/schemas/provider_kind_with_entity_constructor-0.1.0-object_X5FO9-__object_X5FO9_create-object_X5FO9
        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/${ kind_name }`]
        .post
        .requestBody
        .content["application/json"]
        .schema['$ref']).toEqual(`#/components/schemas/${ provider.prefix }-${ provider.version }-${ kind_name }-__${ kind_name }_create-${ kind_name }`);

        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/${ kind_name }`]
            .post
            .responses["200"]
            .content["application/json"]
            .schema["$ref"]).toEqual(`#/components/schemas/Nothing`);

        expect(apiDoc.paths[`/services/${ provider.prefix }/${ provider.version }/${ kind_name }`]
            .post
            .responses["default"]
            .content["application/json"]
            .schema["$ref"]).toEqual(`#/components/schemas/Error`);

        expect(apiDoc.components.schemas[`${ provider.prefix }-${ provider.version }-${ kind_name }-__${ kind_name }_create-${ kind_name }`])
        .toEqual(provider.kinds[0].kind_structure[kind_name]);
    });

    test("Provider kinds with wrong field name in schema should throw validation error", async () => {
        expect.assertions(2);
        try {
            const location_yaml = loadYamlFromTestFactoryDir("test_data/location_kind_test_data.yml");

            let description = location_yaml["Location"]["description"]
            delete location_yaml["Location"]["description"]
            location_yaml["Location"]["decription"] = description

            const location_kind = new KindBuilder(IntentfulBehaviour.SpecOnly).withDescription(location_yaml).build()
            const provider: Provider = new ProviderBuilder("provider_kind_with_wrong_field_name")
                .withVersion("0.1.0")
                .withKinds([location_kind])
                .build();

            const providerDbMock = new Provider_DB_Mock(provider);
            const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
            await apiDocsGenerator.getApiDocs(providerDbMock.provider);
        } catch (err) {
            expect(err.errors.length).toBe(1)
            expect(err.errors[0]).toBe("Schema has invalid name for the field: Location.decription")
        }
    });

    test("Provider kinds with duplicate required fields should throw validation error", async () => {
        expect.assertions(2);
        try {
            const location_yaml = loadYamlFromTestFactoryDir("test_data/location_kind_test_data.yml");

            location_yaml["Location"]["properties"]["v"]["required"] = ["e", "d", "e"]

            const location_kind = new KindBuilder(IntentfulBehaviour.SpecOnly).withDescription(location_yaml).build()
            const provider: Provider = new ProviderBuilder("provider_kind_with_wrong_field_name")
                .withVersion("0.1.0")
                .withKinds([location_kind])
                .build();

            const providerDbMock = new Provider_DB_Mock(provider);
            const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
            await apiDocsGenerator.getApiDocs(providerDbMock.provider);
        } catch (err) {
            expect(err.errors.length).toBe(1)
            expect(err.errors[0]).toBe("Schema field: Location.properties.v.required has duplicate values at indexes 0 and 2")
        }
    });

    test("Provider kinds with empty required list should throw validation error", async () => {
        expect.assertions(2);
        try {
            const location_yaml = loadYamlFromTestFactoryDir("test_data/location_kind_test_data.yml");

            location_yaml["Location"]["required"] = []

            const location_kind = new KindBuilder(IntentfulBehaviour.SpecOnly).withDescription(location_yaml).build()
            const provider: Provider = new ProviderBuilder("provider_kind_with_wrong_field_name")
                .withVersion("0.1.0")
                .withKinds([location_kind])
                .build();

            const providerDbMock = new Provider_DB_Mock(provider);
            const apiDocsGenerator = new ApiDocsGenerator(providerDbMock);
            await apiDocsGenerator.getApiDocs(providerDbMock.provider);
        } catch (err) {
            expect(err.errors.length).toBe(1)
            expect(err.errors[0]).toBe("Expected list for schema field: Location.required to have minimum size: 1, received size: 0")
        }
    });
});
