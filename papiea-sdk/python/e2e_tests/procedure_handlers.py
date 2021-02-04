import e2e_tests as papiea_test

from datetime import datetime, timezone

from papiea.core import AttributeDict, EntityReference, Spec, ConstructorResult

ensure_bucket_exists_takes = AttributeDict(
    EnsureBucketExistsInput=AttributeDict(
        type="object",
        title="Input value of ensure_bucket_exists function",
        description="Name of the bucket to be created/checked for existence",
        required=["bucket_name"],
        properties=AttributeDict(
            bucket_name=AttributeDict(
                type="string"
            )
        )
    )
)
ensure_bucket_exists_returns = AttributeDict(
    EnsureBucketExistsOutput=papiea_test.ref_type(papiea_test.BUCKET_KIND, "Reference of the bucket created/found")
)


async def ensure_bucket_exists(ctx, input_bucket):
    # Run get query to obtain the list of buckets
    # Check if bucket_name exists in the bucket list
    # If true, simply return the bucket
    # Else, create a new bucket with input_bucket_name and return

    try:
        input_bucket_name = input_bucket.bucket_name
        async with ctx.entity_client_for_user(papiea_test.bucket_kind_dict) as bucket_entity_client:
            desired_bucket = await bucket_entity_client.filter(
                AttributeDict(spec=AttributeDict(name=input_bucket_name)))
            if len(desired_bucket.results) != 0:
                papiea_test.logger.debug("Bucket already exists. Returning it...")

                return EntityReference(
                    uuid=desired_bucket.results[0].metadata.uuid,
                    kind=desired_bucket.results[0].metadata.kind
                )

            papiea_test.logger.debug("Bucket not found. Creating new bucket...")

            bucket_ref = await bucket_entity_client.create({"name": input_bucket_name, "objects": list(), "owner": "nutanix"})

            ret_entity = await bucket_entity_client.get(bucket_ref.metadata)

            return EntityReference(
                uuid=ret_entity.metadata.uuid,
                kind=ret_entity.metadata.kind
            )
    except:
        raise
    raise Exception("Unable to create bucket entity")


change_bucket_name_takes = AttributeDict(
    ChangeBucketNameInput=AttributeDict(
        type="object",
        title="Input value of change_bucket_name function",
        description="New name for the bucket",
        required=["bucket_name"],
        properties=AttributeDict(
            bucket_name=AttributeDict(
                type="string"
            )
        )
    )
)
change_bucket_name_returns = AttributeDict(
    ChangeBucketNameOutput=papiea_test.ref_type(papiea_test.BUCKET_KIND, "Reference of the bucket with new name"),
)
change_bucket_name_returns.get("ChangeBucketNameOutput").get("properties") \
    ["message"] = AttributeDict(type="string", description="Error message")


async def change_bucket_name(ctx, entity_bucket, new_bucket):
    # check if there's any bucket with the new name
    # if found, return None/failure
    # else update name and bucket entity

    try:
        new_bucket_name = new_bucket.bucket_name
        async with ctx.entity_client_for_user(papiea_test.bucket_kind_dict) as bucket_entity_client:
            matched_bucket = await bucket_entity_client.filter(AttributeDict(spec=AttributeDict(name=new_bucket_name)))
            if len(matched_bucket.results) == 0:
                papiea_test.logger.debug("Bucket found. Changing the bucket name...")

                entity_bucket.spec.name = new_bucket_name
                await bucket_entity_client.update(
                    metadata=entity_bucket.metadata,
                    spec=entity_bucket.spec
                )

                ret_entity = await bucket_entity_client.get(entity_bucket.metadata)
                return EntityReference(
                    uuid=ret_entity.metadata.uuid,
                    kind=ret_entity.metadata.kind
                )
            else:
                raise Exception("Bucket with new name already exists")
    except:
        raise

    raise Exception("Unable to change name for the bucket entity")


create_object_takes = AttributeDict(
    CreateObjectInput=AttributeDict(
        type="object",
        title="Input value of create_object function",
        description="Name of the object to be created",
        required=["object_name"],
        properties=AttributeDict(
            object_name=AttributeDict(
                type="string"
            )
        )
    )
)
create_object_returns = AttributeDict(
    CreateObjectOutput=papiea_test.ref_type(papiea_test.OBJECT_KIND, "Reference of the object created"),
)
create_object_returns.get("CreateObjectOutput").get("properties") \
    ["message"] = AttributeDict(type="string", description="Error message")


async def create_object(ctx, entity_bucket, input_object):
    # check if object name already exists in entity.objects
    # if found, return None/failure
    # else create a new object entity and add the object name
    # reference in the objects list and return the bucket reference

    try:
        input_object_name = input_object.object_name
        objects_list = entity_bucket.spec.objects
        if not any(obj.name == input_object_name for obj in objects_list):
            papiea_test.logger.debug("Object does not exist. Creating new object...")

            async with ctx.entity_client_for_user(papiea_test.object_kind_dict) as object_entity_client:
                entity_object = await object_entity_client.create({"content": "", "owner": "nutanix"})

                async with ctx.entity_client_for_user(papiea_test.bucket_kind_dict) as bucket_entity_client:
                    entity_bucket.spec.objects.append(
                        AttributeDict(
                            name=input_object_name,
                            reference=EntityReference(
                                uuid=entity_object.metadata.uuid,
                                kind=papiea_test.OBJECT_KIND
                            )
                        )
                    )
                    await bucket_entity_client.update(
                        metadata=entity_bucket.metadata,
                        spec=entity_bucket.spec
                    )

                ret_entity = await object_entity_client.get(entity_object.metadata)
                return EntityReference(
                    uuid=ret_entity.metadata.uuid,
                    kind=ret_entity.metadata.kind
                )
        else:
            raise Exception("Object already exists in the bucket")
    except:
        raise
    raise Exception("Unable to create object entity")


link_object_takes = AttributeDict(
    LinkObjectInput=AttributeDict(
        type="object",
        title="Input value of link_object function",
        description="Information for the new object to be linked",
        required=['object_name', 'object_uuid'],
        properties=AttributeDict(
            object_name=AttributeDict(
                type="string",
                description="Name of the new object to be linked"
            ),
            object_uuid=AttributeDict(
                type="string",
                description="UUID of the object to link to"
            )
        )
    )
)
link_object_returns = AttributeDict(
    LinkObjectOutput=papiea_test.ref_type(papiea_test.OBJECT_KIND, "Reference of the object to which it is linked")
)
link_object_returns.get("LinkObjectOutput").get("properties") \
    ["message"] = AttributeDict(type="string", description="Error message")


async def link_object(ctx, entity_bucket, input_object):
    # assuming input_object to be the object name and the uuid
    # check if the name already exist in the objects list
    # if exists, return None/failure
    # else add object name and uuid in bucket' objects list
    # and return the bucket reference

    try:
        objects_list = entity_bucket.spec.objects
        if not any(obj.name == input_object.object_name for obj in objects_list):
            papiea_test.logger.debug("Object does not exist. Linking the object...")

            async with ctx.entity_client_for_user(papiea_test.bucket_kind_dict) as bucket_entity_client:
                entity_bucket.spec.objects.append(
                    AttributeDict(
                        name=input_object.object_name,
                        reference=EntityReference(
                            uuid=input_object.object_uuid,
                            kind=papiea_test.OBJECT_KIND
                        )
                    )
                )
                await bucket_entity_client.update(
                    metadata=entity_bucket.metadata,
                    spec=entity_bucket.spec
                )

            async with ctx.entity_client_for_user(papiea_test.object_kind_dict) as object_entity_client:
                ret_entity = await object_entity_client.get(AttributeDict(uuid=input_object.object_uuid))
                return EntityReference(
                    uuid=ret_entity.metadata.uuid,
                    kind=ret_entity.metadata.kind
                )
        else:
            raise Exception("Object already exists in the bucket")
    except:
        raise
    raise Exception("Unable to link object entity")


unlink_object_takes = AttributeDict(
    UnlinkObjectInput=AttributeDict(
        type="object",
        title="Input value of unlink_object function",
        description="Name of the object to be unlinked",
        required=["object_name"],
        properties=AttributeDict(
            object_name=AttributeDict(
                type="string"
            )
        )
    )
)
unlink_object_returns = AttributeDict(
    UnlinkObjectOutput=papiea_test.ref_type(papiea_test.BUCKET_KIND,
                                            "Reference of the bucket from which the object was removed"))
unlink_object_returns.get("UnlinkObjectOutput").get("properties") \
    ["message"] = AttributeDict(type="string", description="Error message")


async def unlink_object(ctx, entity_bucket, input_object):
    # assuming input_object to be the object name
    # check if the name exists in the object list
    # if does not exists, return None/failure
    # else remove the object name and reference from the bucket' objects list and
    # and return the bucket reference

    try:
        input_object_name = input_object.object_name
        objects_list = entity_bucket.spec.objects
        if any(obj.name == input_object_name for obj in objects_list):
            papiea_test.logger.debug("Object found. Unlinking the object...")

            async with ctx.entity_client_for_user(papiea_test.bucket_kind_dict) as bucket_entity_client:
                entity_bucket.spec.objects = [d for d in entity_bucket.spec.objects if
                                              d.get("name") != input_object_name]
                await bucket_entity_client.update(
                    metadata=entity_bucket.metadata,
                    spec=entity_bucket.spec
                )

                ret_entity = await bucket_entity_client.get(entity_bucket.metadata)
                return EntityReference(
                    uuid=ret_entity.metadata.uuid,
                    kind=ret_entity.metadata.kind
                )
        else:
            raise Exception("Object not found in the bucket")
    except:
        raise
    raise Exception("Unable to create object entity")


async def bucket_create_handler(ctx, entity_bucket):
    try:
        papiea_test.logger.debug("Executing bucket create intent handler...")

        status = AttributeDict(
            name=entity_bucket.name,
            objects=list()
        )

        return ConstructorResult(spec=status, status=status, metadata={
            "extension": {
                "owner": entity_bucket.owner
            }
        })
    except Exception as ex:
        raise Exception("Unable to execute bucket create intent handler: " + str(ex))


async def bucket_name_handler(ctx, entity_bucket, diff):
    # fetch unique uuids for the objects in the bucket
    # for each uuid, get the object references list
    # iterate and update bucket name if bucket ref match is found
    # update all such object entities

    try:
        papiea_test.logger.debug("Executing bucket name change intent handler...")

        object_uuid_set = set()
        for obj in entity_bucket.spec.objects:
            object_uuid_set.add(obj.reference.uuid)

        async with papiea_test.get_client(papiea_test.OBJECT_KIND) as object_entity_client:
            for object_uuid in object_uuid_set:
                entity_object = await object_entity_client.get(AttributeDict(uuid=object_uuid))

                for i in range(len(entity_object.status.references)):
                    if entity_object.status.references[i].bucket_reference.uuid == entity_bucket.metadata.uuid:
                        entity_object.status.references[i].bucket_name = entity_bucket.spec.name

                await ctx.update_status(entity_object.metadata, entity_object.status)

        entity_bucket.status.name = entity_bucket.spec.name
        await ctx.update_status(entity_bucket.metadata, entity_bucket.status)
    except:
        raise


async def on_object_added_handler(ctx, entity_bucket, diff):
    try:
        papiea_test.logger.debug("Executing object added to bucket intent handler...")

        async with papiea_test.get_client(papiea_test.OBJECT_KIND) as object_entity_client:
            for entity in diff:
                entity_object = await object_entity_client.get(AttributeDict(uuid=entity.spec[0].reference.uuid))

                entity_object.status.references.append(
                    AttributeDict(
                        bucket_name=entity_bucket.spec.name,
                        object_name=entity.spec[0].name,
                        bucket_reference=AttributeDict(
                            uuid=entity_bucket.metadata.uuid,
                            kind=papiea_test.BUCKET_KIND
                        )
                    )
                )
                await ctx.update_status(entity_object.metadata, entity_object.status)

        entity_bucket.status.objects = entity_bucket.spec.objects
        await ctx.update_status(entity_bucket.metadata, entity_bucket.status)
    except:
        raise


async def on_object_removed_handler(ctx, entity_bucket, diff):
    try:
        papiea_test.logger.debug("Executing object removed from bucket intent handler...")

        async with papiea_test.get_client(papiea_test.OBJECT_KIND) as object_entity_client:
            for entity in diff:
                entity_object = await object_entity_client.get(AttributeDict(uuid=entity.status[0].reference.uuid))

                entity_object.status.references[:] = [d for d in entity_object.status.references
                                                      if d.get("object_name") != entity.status[0].name
                                                      or d.get("bucket_name") != entity_bucket.spec.name]

                if not entity_object.status.references:
                    papiea_test.logger.debug("Object refcount is zero. Deleting the object...")
                    await object_entity_client.delete(entity_object.metadata)
                else:
                    await ctx.update_status(entity_object.metadata, entity_object.status)

        entity_bucket.status.objects = entity_bucket.spec.objects
        await ctx.update_status(entity_bucket.metadata, entity_bucket.status)
    except:
        raise


async def object_create_handler(ctx, entity_object):
    try:
        papiea_test.logger.debug("Executing object create intent handler...")

        spec = AttributeDict(
            content=entity_object.content
        )
        status = AttributeDict(
            content=entity_object.content,
            size=len(entity_object.content),
            last_modified=str(datetime.now(timezone.utc)),
            references=list()
        )
        return ConstructorResult(spec=spec, status=status, metadata={
            "extension": {
                "owner": entity_object.owner
            }
        })
    except:
        raise


async def object_content_handler(ctx, entity_object, diff):
    try:
        papiea_test.logger.debug("Executing object content change intent handler...")

        status = AttributeDict(
            content=entity_object.spec.content,
            size=len(entity_object.spec.content),
            last_modified=str(datetime.now(timezone.utc)),
            references=entity_object.status.references
        )
        await ctx.update_status(entity_object.metadata, status)
    except:
        raise
