import * as utils from "./utils"
import * as test_setup from "./test_setup"
import { IntentfulStatus } from "papiea-core";

const config = require("./config")


async function cleanup_entities() {
    const bucket_entity_client = test_setup.get_client(config.bucket);
    const object_entity_client = test_setup.get_client(config.object)
    try {
        let iterator = await bucket_entity_client.list_iter()
        for await (const entity of iterator()) {
            await bucket_entity_client.delete(entity.metadata)
        }

        iterator = await object_entity_client.list_iter()
        for await (const entity of iterator()) {
            await object_entity_client.delete(entity.metadata)
        }
    } catch (err) {
        utils.logger.debug("Failed to cleanup the entities")
    } finally {
        object_entity_client.close()
        bucket_entity_client.close()
    }
}

describe("Entity Client end-to-end tests", () => {
    beforeAll(async () => {
        await test_setup.setup_and_register_sdk();
    });

    afterEach(async () => {
        await cleanup_entities();
    });

    afterAll(async () => {
        await test_setup.cleanup_sdk();
    });

    test("Test to create new unique bucket should succeed", async () => {
        expect.assertions(2);
        const bucket_entity_client = test_setup.get_client(config.bucket);

        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { bucket_name: bucket1_name })
            const bucket1_entity = await bucket_entity_client.get(bucket_ref)
            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)
        } finally {
            bucket_entity_client.close()
        }
    });

    test("Test to create duplicate bucket should succeed with the existing object", async () => {
        expect.assertions(5);
        const bucket_entity_client = test_setup.get_client(config.bucket);

        try {
            const bucket1_name = "test-bucket1"

            let bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket_ref)
            const bucket1_uuid = bucket1_entity.metadata.uuid

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)
            expect(bucket1_entity.metadata.uuid).toEqual(bucket1_uuid)
        } finally {
            bucket_entity_client.close()
        }
    });

    test("Test to create new unique object should succeed", async () => {
        expect.assertions(6);
        const bucket_entity_client = test_setup.get_client(config.bucket);
        const object_entity_client = test_setup.get_client(config.object)

        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"

            const object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })

            const b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.objects.length).toBe(1)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.spec.content).toBe("")
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to create duplicate object in the same bucket should fail", async () => {
        expect.assertions(4);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)

        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            const bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"

            const object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            const b1_object1_entity = await object_entity_client.get(object_ref)

            expect(b1_object1_entity.spec.content).toBe("")

            await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
        } catch (err) {
            expect(err.response.data.error.errors[0].message).toBe("Object already exists in the bucket")
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to link different object in a different bucket should succeed", async () => {
        expect.assertions(11);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)

        try {
            const bucket1_name = "test-bucket1"
            const bucket2_name = "test-bucket2"

            const bucket1_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket1_ref)

            const bucket2_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket2_name })
            let bucket2_entity = await bucket_entity_client.get(bucket2_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)
            expect(bucket2_entity.spec.name).toEqual(bucket2_name)
            expect(bucket2_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"
            const object2_name = "test-object2"

            const object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            let b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket1_ref)

            expect(bucket1_entity.spec.objects.length).toBe(1)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.spec.content).toEqual("")

            const object_input = {
                object_name: object2_name,
                object_uuid: b1_object1_entity.metadata.uuid
            }

            await bucket_entity_client.invoke_procedure("link_object", bucket2_entity.metadata, object_input)
            b1_object1_entity = await object_entity_client.get(object_ref)

            bucket2_entity = await bucket_entity_client.get(bucket2_ref)

            expect(bucket2_entity.spec.objects.length).toBe(1)
            expect(bucket2_entity.spec.objects[0].name).toEqual(object2_name)
            expect(bucket2_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to link same object in a different bucket should succeed", async () => {
        expect.assertions(11);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)

        try {
            const bucket1_name = "test-bucket1"
            const bucket2_name = "test-bucket2"

            const bucket1_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket1_ref)

            const bucket2_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket2_name })
            let bucket2_entity = await bucket_entity_client.get(bucket2_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)
            expect(bucket2_entity.spec.name).toEqual(bucket2_name)
            expect(bucket2_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"

            let object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            let b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket1_ref)

            expect(bucket1_entity.spec.objects.length).toBe(1)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.spec.content).toEqual("")

            const object_input = {
                object_name: object1_name,
                object_uuid: b1_object1_entity.metadata.uuid
            }

            object_ref = await bucket_entity_client.invoke_procedure("link_object", bucket2_entity.metadata, object_input)
            b1_object1_entity = await object_entity_client.get(object_ref)

            bucket2_entity = await bucket_entity_client.get(bucket2_ref)

            expect(bucket2_entity.spec.objects.length).toBe(1)
            expect(bucket2_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket2_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to link to different object in the same bucket should succeed", async () => {
        expect.assertions(9);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)

        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"
            const object2_name = "test-object2"

            let object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            let b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.objects.length).toBe(1)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.spec.content).toEqual("")

            const object_input = {
                object_name: object2_name,
                object_uuid: b1_object1_entity.metadata.uuid
            }

            object_ref = await bucket_entity_client.invoke_procedure("link_object", bucket1_entity.metadata, object_input)
            b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.objects.length).toBe(2)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid) 
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to link to the same object in the same bucket should fail", async () => {
        expect.assertions(7);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)

        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"

            let object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            let b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.objects.length).toBe(1)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.spec.content).toEqual("")

            const object_input = {
                object_name: object1_name,
                object_uuid: b1_object1_entity.metadata.uuid
            }

            await bucket_entity_client.invoke_procedure("link_object", bucket1_entity.metadata, object_input)
        } catch (err) {
            expect(err.response.data.error.errors[0].message).toBe("Object already exists in the bucket")
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to link to different object in a different bucket, different object already exists in the bucket should fail", async () => {
        expect.assertions(13);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)
        try {
            const bucket1_name = "test-bucket1"
            const bucket2_name = "test-bucket2"

            const bucket1_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket1_ref)

            const bucket2_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket2_name })
            let bucket2_entity = await bucket_entity_client.get(bucket2_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)
            expect(bucket2_entity.spec.name).toEqual(bucket2_name)
            expect(bucket2_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"
            const object2_name = "test-object2"

            let object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            const b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket1_ref)

            expect(bucket1_entity.spec.objects.length).toBe(1)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.spec.content).toEqual("")

            object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket2_entity.metadata, { "object_name": object2_name })
            const b2_object2_entity = await object_entity_client.get(object_ref)

            bucket2_entity = await bucket_entity_client.get(bucket2_ref)

            expect(bucket2_entity.spec.objects.length).toBe(1)
            expect(bucket2_entity.spec.objects[0].name).toEqual(object2_name)
            expect(bucket2_entity.spec.objects[0].reference.uuid).toEqual(b2_object2_entity.metadata.uuid)
            expect(b2_object2_entity.spec.content).toEqual("")

            const object_input = {
                object_name: object2_name,
                object_uuid: b1_object1_entity.metadata.uuid
            }

            await bucket_entity_client.invoke_procedure("link_object", bucket2_entity.metadata, object_input)
        } catch (err) {
            expect(err.response.data.error.errors[0].message).toBe("Object already exists in the bucket")
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to link to a non-existent object should fail", async () => {
        expect.assertions(3);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            const bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"

            const object_input = {
                object_name: object1_name,
                object_uuid: "shouldfailuuid"
            }

            await bucket_entity_client.invoke_procedure("link_object", bucket1_entity.metadata, object_input)
        } catch (err) {
            expect(err.response.data.error.errors[0].message).toBe("Entity shouldfailuuid not found")
        } finally {
            bucket_entity_client.close()
        }
    });

    test("Test to unlink from a valid object should succeed", async () => {
        expect.assertions(12);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)
        try {
            const bucket1_name = "test-bucket1"
            let bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"
            const object2_name = "test-object2"

            let object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            let b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.objects.length).toBe(1)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.spec.content).toEqual("")

            const object_input = {
                object_name: object2_name,
                object_uuid: b1_object1_entity.metadata.uuid
            }
            object_ref = await bucket_entity_client.invoke_procedure("link_object", bucket1_entity.metadata, object_input)
            b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.objects.length).toBe(2)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)

            bucket_ref = await bucket_entity_client.invoke_procedure("unlink_object", bucket1_entity.metadata, { "object_name": object2_name })
            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.objects.length).toBe(1)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to unlink last reference for a valid object should delete the object", async () => {
        expect.assertions(7);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)
        try {
            const bucket1_name = "test-bucket1"

            let bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"

            const object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            const b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.objects.length).toBe(1)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.spec.content).toEqual("")

            bucket_ref = await bucket_entity_client.invoke_procedure("unlink_object", bucket1_entity.metadata, { "object_name": object1_name })
            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.objects.length).toBe(0)
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to unlink from a non-existing object should fail", async () => {
        expect.assertions(3);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            const bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"
            await bucket_entity_client.invoke_procedure("unlink_object", bucket1_entity.metadata, { "object_name": object1_name })
        } catch (err) {
            expect(err.response.data.error.errors[0].message).toBe("Object not found in the bucket")
        } finally {
            bucket_entity_client.close()
        }
    });

    test("Test to create bucket and execute intent handler should succeed", async () => {
        expect.assertions(4);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.create(
                {"name": bucket1_name, "objects": [],
                 "owner": "nutanix"}
            )

            const bucket_entity = await bucket_entity_client.get(bucket_ref.metadata)

            expect(bucket_entity.spec.name).toEqual(bucket1_name)
            expect(bucket_entity.spec.objects.length).toBe(0)
            expect(bucket_entity.status.name).toEqual(bucket1_name)
            expect(bucket_entity.status.objects.length).toBe(0)
        } finally {
            bucket_entity_client.close()
        }
    });

    test("Test to change bucket name and execute intent handler should succeed", async () => {
        expect.assertions(17);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)
        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"

            const object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            let b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.objects.length).toBe(1)
            expect(bucket1_entity.spec.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.spec.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.spec.content).toEqual("")

            const retries = 10
            for (let i = 0;i < retries; i++) {
                bucket1_entity = await bucket_entity_client.get(bucket_ref)
                if (bucket1_entity.status.objects.length === 1) {
                    break
                }
                await utils.sleep(5000);
            }

            b1_object1_entity = await object_entity_client.get(object_ref)

            expect(bucket1_entity.status.objects.length).toBe(1)
            expect(bucket1_entity.status.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.status.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.status.references.length).toBe(1)
            expect(b1_object1_entity.status.references[0].bucket_name).toEqual(bucket1_name)
            expect(b1_object1_entity.status.references[0].object_name).toEqual(object1_name)
            expect(b1_object1_entity.status.references[0].bucket_reference.uuid).toEqual(bucket1_entity.metadata.uuid)

            const new_bucket1_name = "new-test-bucket1"
            await bucket_entity_client.invoke_procedure("change_bucket_name", bucket1_entity.metadata, { "bucket_name": new_bucket1_name })

            for(let i = 0; i < retries; i++) {
                bucket1_entity = await bucket_entity_client.get(bucket_ref)
                if (bucket1_entity.status.name === new_bucket1_name) {
                    break
                }
                await utils.sleep(5000)
            }

            b1_object1_entity = await object_entity_client.get(object_ref)

            expect(bucket1_entity.spec.name).toEqual(new_bucket1_name)
            expect(bucket1_entity.status.name).toEqual(new_bucket1_name)
            expect(b1_object1_entity.status.references.length).toBe(1)
            expect(b1_object1_entity.status.references[0].bucket_name).toEqual(new_bucket1_name)
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to add object to bucket and execute intent handler should succeed", async () => {
        expect.assertions(10);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)
        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"

            const object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            let b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(b1_object1_entity.spec.content).toBe("")

            const retries = 10
            for (let i = 0;i < retries;i++) {
                bucket1_entity = await bucket_entity_client.get(bucket_ref)
                if (bucket1_entity.status.objects.length === 1) {
                    break
                }
                await utils.sleep(5000)
            }

            b1_object1_entity = await object_entity_client.get(object_ref)

            expect(bucket1_entity.status.objects.length).toBe(1)
            expect(bucket1_entity.status.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.status.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.status.references.length).toBe(1)
            expect(b1_object1_entity.status.references[0].bucket_name).toEqual(bucket1_name)
            expect(b1_object1_entity.status.references[0].object_name).toEqual(object1_name)
            expect(b1_object1_entity.status.references[0].bucket_reference.uuid).toEqual(bucket1_entity.metadata.uuid)
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to remove object from bucket and execute intent handler should succeed", async () => {
        expect.assertions(12);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)
        try {
            const bucket1_name = "test-bucket1"

            let bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"

            const object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            let b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(b1_object1_entity.spec.content).toBe("")

            const retries = 10
            for (let i = 0;i < retries;i++) {
                bucket1_entity = await bucket_entity_client.get(bucket_ref)
                if (bucket1_entity.status.objects.length === 1) {
                    break
                }
                await utils.sleep(5000)
            }

            b1_object1_entity = await object_entity_client.get(object_ref)

            expect(bucket1_entity.status.objects.length).toBe(1)
            expect(bucket1_entity.status.objects[0].name).toEqual(object1_name)
            expect(bucket1_entity.status.objects[0].reference.uuid).toEqual(b1_object1_entity.metadata.uuid)
            expect(b1_object1_entity.status.references.length).toBe(1)
            expect(b1_object1_entity.status.references[0].bucket_name).toEqual(bucket1_name)
            expect(b1_object1_entity.status.references[0].object_name).toEqual(object1_name)
            expect(b1_object1_entity.status.references[0].bucket_reference.uuid).toEqual(bucket1_entity.metadata.uuid)

            bucket_ref = await bucket_entity_client.invoke_procedure("unlink_object", bucket1_entity.metadata, { "object_name": object1_name })

            for(let i = 0;i < retries;i++) {
                bucket1_entity = await bucket_entity_client.get(bucket_ref)
                if (bucket1_entity.status.objects.length === 0) {
                    break
                }
                await utils.sleep(5000)
            }

            expect(bucket1_entity.spec.objects.length).toBe(0)
            expect(bucket1_entity.status.objects.length).toBe(0)
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    });

    test("Test to create object and execute intent handler should succeed", async () => {
        expect.assertions(4);
        const object_entity_client = test_setup.get_client(config.object)
        try {
            const object_ref = await object_entity_client.create(
                {"content": "test",
                 "owner": "nutanix"}
            )

            const object_entity = await object_entity_client.get(object_ref.metadata)

            expect(object_entity.spec.content).toBe("test")
            expect(object_entity.status.content).toBe("test")
            expect(object_entity.status.size).toBe(4)
            expect(object_entity.status.references.length).toBe(0)
        } finally {
            object_entity_client.close()
        }
    });

    test("Test to change object content and execute intent handler should succeed", async () => {
        expect.assertions(4);
        const bucket_entity_client = test_setup.get_client(config.bucket)
        const object_entity_client = test_setup.get_client(config.object)
        try {
            const bucket1_name = "test-bucket1"

            const bucket_ref = await bucket_entity_client.invoke_kind_procedure("ensure_bucket_exists", { "bucket_name": bucket1_name })
            let bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(bucket1_entity.spec.name).toEqual(bucket1_name)
            expect(bucket1_entity.spec.objects.length).toBe(0)

            const object1_name = "test-object1"

            const object_ref = await bucket_entity_client.invoke_procedure("create_object", bucket1_entity.metadata, { "object_name": object1_name })
            let b1_object1_entity = await object_entity_client.get(object_ref)

            bucket1_entity = await bucket_entity_client.get(bucket_ref)

            expect(b1_object1_entity.spec.content).toBe("")

            const obj_content = "test-content"
            const spec = {
                content: obj_content
            }

            const watcher_ref = await object_entity_client.update(b1_object1_entity.metadata, spec)
            const retries = 10
            const watcherApi = test_setup.get_intent_watcher_client()
            for(let i = 0; i < retries; i++) {
                const intent_watcher = await watcherApi.get(watcher_ref!.uuid)
                if (intent_watcher.status === IntentfulStatus.Completed_Successfully) {
                    break
                }
                await utils.sleep(5000)
            }

            b1_object1_entity = await object_entity_client.get(object_ref)

            expect(b1_object1_entity.spec.content).toEqual(obj_content)
        } finally {
            object_entity_client.close()
            bucket_entity_client.close()
        }
    })
})