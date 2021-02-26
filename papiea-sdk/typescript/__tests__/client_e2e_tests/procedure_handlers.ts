import * as utils from "./utils"
import { IntentfulCtx_Interface } from "../../src/provider_sdk/typescript_sdk";

const config = require("./config")

export const ensure_bucket_exists_takes = {
    EnsureBucketExistsInput: {
        type: "object",
        title: "Input value of ensure_bucket_exists function",
        description: "Name of the bucket to be created/checked for existence",
        required: ["bucket_name"],
        properties: {
            bucket_name: {
                type: "string"
            }
        }
    }
}
export const ensure_bucket_exists_returns = {
    EnsureBucketExistsOutput: utils.get_kind_ref_type(config.bucket, "Reference of the bucket created/found")
}

export async function ensure_bucket_exists(ctx: IntentfulCtx_Interface, input_bucket: any) {
    // Run get query to obtain the list of buckets
    // Check if bucket_name exists in the bucket list
    // If true, simply return the bucket
    // Else, create a new bucket with input_bucket_name and return

    const client = ctx.get_provider_client(config.admin_s2s_key)
    const bucket_entity_client = client.get_kind(config.bucket)

    try {
        const input_bucket_name = input_bucket.bucket_name
        const desired_bucket = await bucket_entity_client.filter({
            spec: {
                name: input_bucket_name
            }
        })

        if (desired_bucket.results.length !== 0) {
            utils.logger.debug("Bucket already exists. Returning it...")

            return {
                uuid: desired_bucket.results[0].metadata.uuid,
                kind: desired_bucket.results[0].metadata.kind
            }
        }

        utils.logger.debug("Bucket not found. Creating new bucket...")

        const bucket_ref = await bucket_entity_client.create({
            name: input_bucket_name,
            objects: [],
        });

        const ret_entity = await bucket_entity_client.get(bucket_ref.metadata)

        return {
            uuid: ret_entity.metadata.uuid,
            kind: ret_entity.metadata.kind
        }
    } finally {
        bucket_entity_client.close()
        client.close()
    }
}

export const change_bucket_name_takes = {
    ChangeBucketNameInput: {
        type: "object",
        title: "Input value of change_bucket_name function",
        description: "New name for the bucket",
        required: ["bucket_name"],
        properties: {
            bucket_name: {
                type: "string"
            }
        }
    }
}
export const change_bucket_name_returns = {
    ChangeBucketNameOutput: utils.get_kind_ref_type(config.bucket, "Reference of the bucket with new name")
}

export async function change_bucket_name(ctx: IntentfulCtx_Interface, entity_bucket: any, new_bucket: any) {
    // Check if there"s any bucket with the new name
    // If found, return None/failure
    // Else update name and bucket entity

    const client = ctx.get_provider_client(config.admin_s2s_key)
    const bucket_entity_client = client.get_kind(config.bucket)

    try {
        const new_bucket_name = new_bucket.bucket_name
        const desired_bucket = await bucket_entity_client.filter({
            spec: {
                name: new_bucket_name
            }
        })

        if (desired_bucket.results.length !== 0) {
            throw new Error("Bucket with the new name already exists")
        }

        utils.logger.debug("Bucket found. Changing the bucket name...")

        entity_bucket.spec.name = new_bucket_name
        await bucket_entity_client.update(entity_bucket.metadata, entity_bucket.spec);

        const ret_entity = await bucket_entity_client.get(entity_bucket.metadata)

        return {
            uuid: ret_entity.metadata.uuid,
            kind: ret_entity.metadata.kind
        }
    } finally {
        bucket_entity_client.close()
        client.close()
    }
}

export const create_object_takes = {
    CreateObjectInput: {
        type: "object",
        title: "Input value of create_object function",
        description: "Name of the object to be created",
        required: ["object_name"],
        properties: {
            object_name: {
                type: "string"
            }
        }
    }
}
export const create_object_returns = {
    CreateObjectOutput: utils.get_kind_ref_type(config.object, "Reference of the object created")
}

export async function create_object(ctx: IntentfulCtx_Interface, entity_bucket: any, input_object: any) {
    // Check if object name already exists in entity.objects
    // If found, return None/failure
    // Else create a new object entity and add the object name
    // reference in the objects list and return the bucket reference

    const input_object_name = input_object.object_name
    const objects_list = entity_bucket.spec.objects
    const client = ctx.get_provider_client(config.admin_s2s_key)
    const bucket_entity_client = client.get_kind(config.bucket)
    const object_entity_client = client.get_kind(config.object)

    try {
        const existing_object = objects_list.find((obj: any) => obj.name === input_object_name);
        if (existing_object === undefined) {
            utils.logger.debug("Object does not exist. Creating new object...")

            const entity_object = await object_entity_client.create({
                content: "",
                owner: "nutanix"
            });

            entity_bucket.spec.objects.push({
                name: input_object_name,
                reference: {
                    uuid: entity_object.metadata.uuid,
                    kind: config.object
                }
            });

            await bucket_entity_client.update(entity_bucket.metadata, entity_bucket.spec)

            const ret_entity = await object_entity_client.get(entity_object.metadata)

            return {
                uuid: ret_entity.metadata.uuid,
                kind: ret_entity.metadata.kind
            }
        } else {
            throw new Error("Object already exists in the bucket")
        }
    } finally {
        object_entity_client.close()
        bucket_entity_client.close()
        client.close()
    }
}

export const link_object_takes = {
    LinkObjectInput: {
        type: "object",
        title: "Input value of link_object function",
        description: "Information for the new object to be linked",
        required: ["object_name", "object_uuid"],
        properties: {
            object_name: {
                type: "string",
                description: "Name of the new object to be linked"
            },
            object_uuid: {
                type: "string",
                description: "UUID of the object to link to"
            }
        }
    }
}
export const link_object_returns = {
    LinkObjectOutput: utils.get_kind_ref_type(config.object, "Reference of the object to which it is linked")
}

export async function link_object(ctx: IntentfulCtx_Interface, entity_bucket: any, input_object: any) {
    // Assuming input_object to be the object name and the uuid
    // Check if the name already exist in the objects list
    // If exists, return None/failure
    // Else add object name and uuid in bucket" objects list
    // and return the bucket reference

    const client = ctx.get_provider_client(config.admin_s2s_key)
    const bucket_entity_client = client.get_kind(config.bucket)
    const object_entity_client = client.get_kind(config.object)
    try {
        const input_object_name = input_object.object_name
        const objects_list = entity_bucket.spec.objects

        const existing_object = objects_list.find((obj: any) => obj.name === input_object_name);
        if (existing_object === undefined) {
            utils.logger.debug("Object does not exist. Linking the object...")

            entity_bucket.spec.objects.push({
                name: input_object_name,
                reference: {
                    uuid: input_object.object_uuid,
                    kind: config.object
                }
            });

            await bucket_entity_client.update(entity_bucket.metadata, entity_bucket.spec)
            const ret_entity = await object_entity_client.get({ uuid: input_object.object_uuid, kind: config.object })

            return {
                uuid: ret_entity.metadata.uuid,
                kind: ret_entity.metadata.kind
            }
        } else {
            throw new Error("Object already exists in the bucket")
        }
    } finally {
        object_entity_client.close()
        bucket_entity_client.close()
        client.close()
    }
}

export const unlink_object_takes = {
    UnlinkObjectInput: {
        type: "object",
        title: "Input value of unlink_object function",
        description: "Name of the object to be unlinked",
        required: ["object_name"],
        properties: {
            object_name: {
                type: "string"
            }
        }
    }
}
export const unlink_object_returns = {
    UnlinkObjectOutput: utils.get_kind_ref_type(config.bucket, "Reference of the bucket from which the object was removed")
}

export async function unlink_object(ctx: IntentfulCtx_Interface, entity_bucket: any, input_object: any) {
    // Assuming input_object to be the object name
    // Check if the name exists in the object list
    // If does not exists, return None/failure
    // Else remove the object name and reference from the bucket" objects list and
    // and return the bucket reference

    const input_object_name = input_object.object_name
    const objects_list = entity_bucket.spec.objects
    const client = ctx.get_provider_client(config.admin_s2s_key)
    const bucket_entity_client = client.get_kind(config.bucket)

    try {
        const existing_object = objects_list.find((obj: any) => obj.name === input_object_name);
        if (existing_object !== undefined) {
            utils.logger.debug("Object found. Unlinking the object...")

            entity_bucket.spec.objects = entity_bucket.spec.objects.filter(function(obj: any) { return obj.name !== input_object_name; });

            await bucket_entity_client.update(entity_bucket.metadata, entity_bucket.spec)

            const ret_entity = await bucket_entity_client.get(entity_bucket.metadata)

            return {
                uuid: ret_entity.metadata.uuid,
                kind: ret_entity.metadata.kind
            }
        } else {
            throw new Error("Object not found in the bucket")
        }
    } finally {
        bucket_entity_client.close()
        client.close()
    }

}

export async function bucket_create_handler(ctx: IntentfulCtx_Interface, entity_bucket: any) {
    utils.logger.debug("Executing bucket create intent handler...")

    const status = {
        name: entity_bucket.name,
        objects: []
    }
    const metadata = {
        extension: {
            owner: "nutanix"
        }
    }

    return {
        spec: status,
        status: status,
        metadata: metadata
    }
}

export async function bucket_name_handler(ctx: IntentfulCtx_Interface, entity_bucket: any, diff: any) {
    // Fetch unique uuids for the objects in the bucket
    // For each uuid, get the object references list
    // iterate and update bucket name if bucket ref match is found
    // update all such object entities

    utils.logger.debug("Executing bucket name change intent handler...")

    const client = ctx.get_provider_client(config.admin_s2s_key)
    const object_entity_client = client.get_kind(config.object)

    try {
        let object_uuid_set = new Set<string>()
        entity_bucket.spec.objects.forEach((obj: any) => { object_uuid_set.add(obj.reference.uuid) });

        object_uuid_set.forEach(async (object_uuid) => {
            const entity_object = await object_entity_client.get({ uuid: object_uuid, kind: config.object })
            for (let i = 0; i < entity_object.status.references.length; i++) {
                if (entity_object.status.references[i].bucket_reference.uuid == entity_bucket.metadata.uuid) {
                    entity_object.status.references[i].bucket_name = entity_bucket.spec.name
                }
            }

            await ctx.update_status(entity_object.metadata, entity_object.status)
        });

        entity_bucket.status.name = entity_bucket.spec.name
        await ctx.update_status(entity_bucket.metadata, entity_bucket.status)
    } finally {
        object_entity_client.close()
        client.close()
    }
}

export async function on_object_added_handler(ctx: IntentfulCtx_Interface, entity_bucket: any, diff: any) {
    utils.logger.debug("Executing object added to bucket intent handler...")

    const client = ctx.get_provider_client(config.admin_s2s_key)
    const object_entity_client = client.get_kind(config.object)

    try {
        diff.forEach(async (entity: any) => {
            const entity_object = await object_entity_client.get({ uuid: entity.spec[0].reference.uuid, kind: config.object })

            entity_object.status.references.push({
                bucket_name: entity_bucket.spec.name,
                object_name: entity.spec[0].name,
                bucket_reference: {
                    uuid: entity_bucket.metadata.uuid,
                    kind: config.bucket
                }
            })
            await ctx.update_status(entity_object.metadata, entity_object.status)
        })

        entity_bucket.status.objects = entity_bucket.spec.objects
        await ctx.update_status(entity_bucket.metadata, entity_bucket.status)
    } finally {
        object_entity_client.close()
        client.close()
    }
}

export async function on_object_removed_handler(ctx: IntentfulCtx_Interface, entity_bucket: any, diff: any) {
    utils.logger.debug("Executing object removed from bucket intent handler...")

    const client = ctx.get_provider_client(config.admin_s2s_key)
    const object_entity_client = client.get_kind(config.object)

    try {
        diff.forEach(async (entity: any) => {
            const entity_object = await object_entity_client.get({ uuid: entity.status[0].reference.uuid, kind: config.object })

            entity_bucket.status.references = entity_object.status.references.filter(function(obj: any) {
                return obj.object_name !== entity.status[0].name || obj.bucket_name !== entity_bucket.spec.name
            })

            if (entity_object.status.references.length === 0) {
                utils.logger.debug("Object refcount is zero. Deleting the object...")
                await object_entity_client.delete(entity_object.metadata)
            } else {
                await ctx.update_status(entity_object.metadata, entity_object.status)
            }
        })

        entity_bucket.status.objects = entity_bucket.spec.objects
        await ctx.update_status(entity_bucket.metadata, entity_bucket.status)
    } finally {
        object_entity_client.close()
        client.close()
    }
}

export async function object_create_handler(ctx: IntentfulCtx_Interface, entity_object: any) {
    utils.logger.debug("Executing object create intent handler...")

    const spec = {
        content: entity_object.content
    }

    const status = {
        content: entity_object.content,
        size: entity_object.content.length,
        last_modified: new Date().toUTCString(),
        references: []
    }

    return {
        spec: spec,
        status: status,
        metadata: {
            extension: {
                owner: entity_object.owner
            }
        }
    }
}

export async function object_content_handler(ctx: IntentfulCtx_Interface, entity_object: any, diff: any) {
    utils.logger.debug("Executing object content change intent handler...")

    const status = {
        content: entity_object.spec.content,
        size: entity_object.spec.content.length,
        last_modified: new Date().toUTCString(),
        references: entity_object.status.references
    }

    await ctx.update_status(entity_object.metadata, status)
}