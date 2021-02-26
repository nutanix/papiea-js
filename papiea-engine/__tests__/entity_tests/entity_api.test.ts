import axios from "axios";
import { Metadata, Spec } from "papiea-core";
import { ProviderBuilder } from "../test_data_factory";
import { stringify } from "querystring"
import uuid = require("uuid");

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

describe("Entity API tests", () => {
    const providerPrefix = "test";
    const providerVersion = "0.1.0";
    let kind_name: string
    beforeAll(async () => {
        const provider = new ProviderBuilder(providerPrefix).withVersion(providerVersion).withKinds().build();
        kind_name = provider.kinds[0].name;
        await providerApi.post('/', provider);
    });

    afterAll(async () => {
        await providerApi.delete(`${providerPrefix}/${providerVersion}`);
    });

    let entity_metadata: Metadata;
    let entity_spec: Spec;
    test("Create spec-only entity", async () => {
        expect.assertions(3);
        const { data: { metadata, spec } } = await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                x: 10,
                y: 11
            }
        });
        expect(metadata).not.toBeUndefined();
        expect(metadata.spec_version).toEqual(1);
        expect(spec).not.toBeUndefined();
        entity_metadata = metadata;
        entity_spec = spec;
    });

    test("Create entity with malformed spec should fail", async () => {
        expect.assertions(1);
        try {
            await entityApi.post(`/${providerPrefix}/${providerVersion}/${kind_name}`, {
                spec: {
                    x: "Totally not a number",
                    y: 11
                }
            });
        } catch (err) {
            const res = err.response;
            expect(res.status).toEqual(400);
        }
    });

    test("Get spec-only entity", async () => {
        expect.assertions(2);
        const res = await entityApi.get(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ entity_metadata.uuid }`);
        expect(res.data.spec).toEqual(entity_spec);
        expect(res.data.status).toEqual(entity_spec);
    });

    test("Get non-existent spec-only entity should fail", async () => {
        expect.assertions(2);
        try {
            await entityApi.get(`/${ providerPrefix }/${providerVersion}/${ kind_name }/${ uuid() }`);
        } catch (e) {
            expect(e.response.status).toBe(404);
            expect(e.response.data).not.toBeUndefined();

        }
    });

    test("Filter entity", async () => {
        expect.hasAssertions();
        let res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            spec: {
                x: 10,
                y: 11
            }
        });
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
        res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            spec: {
                x: 10,
                y: 11,
                z: 111
            }
        });
        expect(res.data.results.length).toBe(0);
    });

    test("Filter spec only entity should contain status", async () => {
        expect.hasAssertions();
        const res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            spec: {
                x: 10,
                y: 11
            }
        });
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
        const entity = res.data.results[0];
        expect(entity.spec.x).toEqual(10);
        expect(entity.status).toEqual(entity.spec);
    });

    test("Filter entity by status", async () => {
        expect.hasAssertions();
        let res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            status: {
                x: 10,
                y: 11
            }
        });
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
        res.data.results.forEach((entity: any) => {
            expect(entity.status.x).toEqual(10);
            expect(entity.status.y).toEqual(11);
        });
        res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            status: {
                x: 10
            }
        });
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
        res.data.results.forEach((entity: any) => {
            expect(entity.status.x).toEqual(10);
        });
        res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            status: {
                x: 10,
                z: 1111
            }
        });
        expect(res.data.results.length).toBe(0);
    });

    test("Filter entity by spec and status", async () => {
        expect.hasAssertions();
        const res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            spec: {
                x: 10,
                y: 11
            },
            status: {
                x: 10,
                y: 11
            }
        });
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
        res.data.results.forEach((entity: any) => {
            expect(entity.spec.x).toEqual(10);
            expect(entity.spec.y).toEqual(11);
            expect(entity.status.x).toEqual(10);
            expect(entity.status.y).toEqual(11);
        });
    });

    // TODO: rewrite it with fast check
    test("Filter entity by nested fields", async () => {
        await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                x: 10,
                y: 11,
                v: {
                    e: 12,
                    d: 13
                }
            }
        });
        let res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            spec: {
                x: 10,
                v: {
                    e: 12
                }
            }
        });
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
        res.data.results.forEach((entity: any) => {
            expect(entity.spec.x).toEqual(10);
            expect(entity.spec.v.e).toEqual(12);
        });
        res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            spec: {
                x: 10,
                v: {
                    e: 12,
                    d: 13
                }
            }
        });
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
        res.data.results.forEach((entity: any) => {
            expect(entity.spec.x).toEqual(10);
            expect(entity.spec.v.e).toEqual(12);
        });
        res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter?exact=true`, {
            spec: {
                x: 10,
                v: {
                    e: 12
                }
            }
        });
        expect(res.data.results.length).toBe(0);

        res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            status: {
                x: 10,
                v: {
                    e: 12
                }
            }
        });
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
        res.data.results.forEach((entity: any) => {
            expect(entity.status.x).toEqual(10);
            expect(entity.status.v.e).toEqual(12);
        });
        res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter?exact=true`, {
            status: {
                x: 10,
                y: 11,
                v: {
                    e: 12,
                    d: 13
                },
            }
        });
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
        res.data.results.forEach((entity: any) => {
            expect(entity.status.x).toEqual(10);
            expect(entity.status.v.e).toEqual(12);
        });
        res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter?exact=true`, {
            status: {
                x: 10,
                v: {
                    e: 12
                }
            }
        });
        expect(res.data.results.length).toBe(0);

        res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            spec: {
                x: 10,
                y: 11,
                v: {
                    e: 12,
                    d: 13
                },
            },
            status: {
                x: 10,
                y: 11,
                v: {
                    e: 12,
                    d: 13
                },
            }
        });
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
        res.data.results.forEach((entity: any) => {
            expect(entity.spec.x).toEqual(10);
            expect(entity.spec.v.e).toEqual(12);
            expect(entity.status.x).toEqual(10);
            expect(entity.status.v.e).toEqual(12);
        });
    });

    test("Filter entity by wrong field should return bad request", async () => {
        expect.assertions(3);
        try {
            await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
                'spec.x': 10
            });
            throw new Error("Filter entity by wrong field should return bad request");
        } catch (e) {
            expect(e.response.status).toEqual(400);
        }
        try {
            await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter?a=b`, {
                spec: {
                    x: 10
                }
            });
            throw new Error("Filter entity by wrong field should return bad request");
        } catch (e) {
            expect(e.response.status).toEqual(400);
        }
        try {
            await entityApi.get(`${ providerPrefix }/${ providerVersion }/${ kind_name }?a=b`);
            throw new Error("Filter entity by wrong field should return bad request");
        } catch (e) {
            expect(e.response.status).toEqual(400);
        }
    });

    test("Filter entity with query params", async () => {
        expect.assertions(1);
        const spec = {
            x: 10,
            y: 11
        };
        const spec_query = {
            spec: JSON.stringify(spec)
        };
        const res = await entityApi.get(`${ providerPrefix }/${ providerVersion }/${ kind_name }?${ stringify(spec_query) }`);
        expect(res.data.results.length).toBeGreaterThanOrEqual(1);
    });

    test("Update spec-only entity spec", async () => {
        expect.assertions(3);
        let res = await entityApi.put(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ entity_metadata.uuid }`, {
            spec: {
                x: 20,
                y: 21
            },
            metadata: {
                spec_version: 1
            }
        });
        expect(res.data.watcher).toBeNull()
        res = await entityApi.get(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ entity_metadata.uuid }`);
        expect(res.data.spec.x).toEqual(20);
        expect(res.data.status.x).toEqual(20);
    });

    test("Update entity with malformed spec should fail", async () => {
        expect.assertions(2);
        try {
            const { data: { metadata, spec } } = await entityApi.post(`/${providerPrefix}/${providerVersion}/${kind_name}`, {
                spec: {
                    x: 10,
                    y: 11
                }
            });
            expect(metadata).not.toBeUndefined();
            await entityApi.put(`/${providerPrefix}/${providerVersion}/${kind_name}/${metadata.uuid}`, {
                spec: {
                    x: "Totally not a number",
                    y: 21
                },
                metadata: {
                    spec_version: 1
                }
            });
        } catch (err) {
            const res = err.response;
            expect(res.status).toEqual(400);
        }
    });

    test("Create entity with non valid uuid should be an error", async () => {
        expect.assertions(1);
        try {
            const { data: { metadata, spec } } = await entityApi.post(`/${providerPrefix}/${providerVersion}/${kind_name}`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: "123"
                }
            });
        } catch (e) {
            expect(e).toBeDefined();
        }
    });

    test("Create entity and provide uuid", async () => {
        expect.assertions(2);
        const entity_uuid = uuid();
        const { data: { metadata, spec } } = await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                x: 10,
                y: 11
            },
            metadata: {
                uuid: entity_uuid
            }
        });
        expect(metadata.uuid).toEqual(entity_uuid);
        const res = await entityApi.get(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ entity_uuid }`);
        expect(res.data.metadata.uuid).toEqual(entity_uuid);
    });

    test("Create entity with duplicate", async () => {
        expect.assertions(4);
        const entity_uuid = uuid();
        const { data: { metadata, spec } } = await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                x: 10,
                y: 11
            },
            metadata: {
                uuid: entity_uuid
            }
        });
        expect(metadata.uuid).toEqual(entity_uuid);
        const res = await entityApi.get(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ entity_uuid }`);
        expect(res.data.metadata.uuid).toEqual(entity_uuid);
        try {
            await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: entity_uuid
                }
            });
        } catch (e) {
            expect(e.response.status).toEqual(409)
            expect(e.response.data.error.error_details.message).toEqual(`Entity with UUID ${entity_uuid} of kind: ${providerPrefix}/${providerVersion}/${kind_name} already exists.`)
        }
    });

    test("Delete entity", async () => {
        expect.assertions(1);
        const { data: { metadata, spec } } = await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                x: 10,
                y: 11
            }
        });
        await entityApi.delete(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ metadata.uuid }`);
        try {
            await entityApi.get(`/${providerPrefix}/${providerVersion}/${kind_name}/${metadata.uuid}`);
        } catch (e) {
            expect(e).toBeDefined();
        }
    });

    test("Can create, delete and recreate entity with same uuid", async () => {
        expect.assertions(2);
        const id = uuid()
        const { data: { metadata, spec } } = await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                x: 10,
                y: 11
            },
            metadata: {
                uuid: id
            }
        });
        await entityApi.delete(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ metadata.uuid }`);
        await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                x: 10,
                y: 11
            },
            metadata: {
                uuid: id
            }
        });
        await entityApi.delete(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ metadata.uuid }`);
        try {
            await entityApi.get(`/${providerPrefix}/${providerVersion}/${kind_name}/${metadata.uuid}`);
        } catch (e) {
            expect(e).toBeDefined();
        }
        const res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter?deleted=true`, {
            metadata: {
                uuid: metadata.uuid,
            }
        });
        expect(res.data.results.length).toEqual(2)
    });

    test("Recreate deleted entity with the same spec version should fail", async () => {
        expect.assertions(2);
        const id = uuid()
        const { data: { metadata, spec } } = await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                x: 10,
                y: 11
            },
            metadata: {
                uuid: id
            }
        });
        await entityApi.delete(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ metadata.uuid }`);
        try {
            await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: id,
                    spec_version: 1
                }
            });
        } catch (e) {
            expect(e.response.status).toEqual(409)
            expect(e.response.data.error.error_details.message).toEqual(`Deleted entity with UUID ${id} of kind: ${providerPrefix}/${providerVersion}/${kind_name} already exists with this spec version.`)
        }
    });

    test("Recreated after deletion entity should get appropriate version", async () => {
        expect.assertions(1);
        const id = uuid()
        const { data: { metadata, spec } } = await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                x: 10,
                y: 11
            },
            metadata: {
                uuid: id
            }
        });
        await entityApi.delete(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ metadata.uuid }`);
        const result = await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    uuid: id,
                }
            });
        expect(result.data.metadata.spec_version).toEqual(3)
    });

    test("Filter deleted entity", async () => {
        expect.hasAssertions();
        const { data: { metadata, spec } } = await entityApi.post(`/${ providerPrefix }/${ providerVersion }/${ kind_name }`, {
            spec: {
                x: 10,
                y: 11
            }
        });
        await entityApi.delete(`/${ providerPrefix }/${ providerVersion }/${ kind_name }/${ metadata.uuid }`);
        let res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter`, {
            metadata: {
                uuid: metadata.uuid
            }
        });
        expect(res.data.results.length).toBe(0);
        for (const deleted_at of ["papiea_one_hour_ago", "papiea_one_day_ago"]) {
            let res = await entityApi.post(`${ providerPrefix }/${ providerVersion }/${ kind_name }/filter?deleted=true`, {
                metadata: {
                    uuid: metadata.uuid,
                    deleted_at: deleted_at
                }
            });
            expect(res.data.results.length).toBe(1);
            expect(res.data.results[0].spec).toEqual(spec);
            expect(res.data.results[0].status).toEqual(spec);
        }
    });
});
