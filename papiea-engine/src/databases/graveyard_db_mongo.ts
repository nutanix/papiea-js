import { ClientSession, Collection, Db, MongoClient } from "mongodb"
import { Graveyard_DB } from "./graveyard_db_interface"
import { Logger } from 'papiea-backend-utils'
import { Provider_Entity_Reference, Entity, Metadata } from "papiea-core";
import { SortParams } from "../entity/entity_api_impl"
import { build_filter_query } from "./utils/filtering"
import { PapieaException } from "../errors/papiea_exception";

export class Graveyard_DB_Mongo implements Graveyard_DB {
    collection: Collection
    logger: Logger
    entity_collection: Collection
    client: MongoClient

    constructor(logger: Logger, db: Db, client: MongoClient) {
        this.collection = db.collection("graveyard")
        this.entity_collection = db.collection("entity")
        this.logger = logger
        this.client = client
    }

    async dispose(entity: Entity): Promise<void> {
        // TODO: this is a transaction operation
        // TODO: Mongo only allows transactions on replica sets
        // const session = this.client.startSession()
        // this.session = session
        // try {
        //     await session.withTransaction(async () => {
        //
        //         await this.save_to_graveyard(entity);
        //         await this.delete_entity(entity.metadata);
        //     });
        // } finally {
        //     this.session = undefined
        //     await session.endSession();
        // }
        await this.save_to_graveyard(entity);
        await this.delete_entity(entity.metadata);
    }

    async delete_entity(entity_ref: Provider_Entity_Reference): Promise<void> {
        const result = await this.entity_collection.deleteOne(
            {
                "metadata.uuid": entity_ref.uuid,
                "metadata.kind": entity_ref.kind,
                "metadata.provider_prefix": entity_ref.provider_prefix,
                "metadata.provider_version": entity_ref.provider_version
            })
        if (result.result.n === undefined || result.result.ok !== 1) {
            throw new PapieaException(`MongoDBError: Failed to remove entity for kind ${entity_ref.provider_prefix}/${entity_ref.provider_version}/${entity_ref.kind}`, { provider_prefix: entity_ref.provider_prefix, provider_version: entity_ref.provider_version, kind_name: entity_ref.kind, additional_info: { "entity_uuid": entity_ref.uuid }});
        }
        if (result.result.n !== 1 && result.result.n !== 0) {
            throw new PapieaException(`MongoDBError: Amount of entities deleted must be 0 or 1, found: ${result.result.n} for kind ${entity_ref.provider_prefix}/${entity_ref.provider_version}/${entity_ref.kind}`, { provider_prefix: entity_ref.provider_prefix, provider_version: entity_ref.provider_version, kind_name: entity_ref.kind, additional_info: { "entity_uuid": entity_ref.uuid }});
        }
        return;
    }

    async init(): Promise<void> {
        try {
            await this.collection.createIndex(
                { "metadata.uuid": 1, "metadata.provider_version": 1,
                    "metadata.kind": 1, "metadata.provider_prefix": 1, "metadata.deleted_at": 1 },
                { unique: true },
            )
        } catch (err) {
            throw err
        }
    }

    async save_to_graveyard(entity: Entity): Promise<void> {
        entity.metadata.spec_version++
        entity.metadata.deleted_at = new Date()
        const result = await this.collection.insertOne(entity)
        if (result.result.n !== 1) {
            throw new PapieaException(`MongoDBError: Amount of saved entries doesn't equal to 1: ${result.result.n} for kind ${entity.metadata.provider_prefix}/${entity.metadata.provider_version}/${entity.metadata.kind}`, { provider_prefix: entity.metadata.provider_prefix, provider_version: entity.metadata.provider_version, kind_name: entity.metadata.kind, additional_info: { "entity_uuid": entity.metadata.uuid }})
        }
    }

    async list_entities(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<Entity[]> {
        const filter = build_filter_query(fields_map, exact_match)
        if (filter["metadata.deleted_at"] === null) {
            delete filter["metadata.deleted_at"]
        }
        if (sortParams) {
            return await this.collection.find(filter).sort(sortParams).toArray();
        } else {
            return await this.collection.find(filter).toArray();
        }
    }

    async get_entity(entity_ref: Provider_Entity_Reference): Promise<Entity> {
        const result = await this.collection.findOne(
            {
                "metadata.uuid": entity_ref.uuid,
                "metadata.provider_prefix": entity_ref.provider_prefix,
                "metadata.provider_version": entity_ref.provider_version,
                "metadata.kind": entity_ref.kind
            }
        );
        if (result === null) {
            throw new PapieaException(`MongoDBError: Could not find entity of kind ${entity_ref.provider_prefix}/${entity_ref.provider_version}/${entity_ref.kind}`, { provider_prefix: entity_ref.provider_prefix, provider_version: entity_ref.provider_version, kind_name: entity_ref.kind, additional_info: { "entity_uuid": entity_ref.uuid }});
        }
        return result;
    }

    // The function returns a maximum spec version in the graveyard
    // If there is no corresponding record in the graveyard, function returns 0
    async get_highest_spec_version(entity_ref: Provider_Entity_Reference): Promise<number> {
        const result = await this.collection.find(
            {
                "metadata.uuid": entity_ref.uuid,
                "metadata.provider_prefix": entity_ref.provider_prefix,
                "metadata.provider_version": entity_ref.provider_version,
                "metadata.kind": entity_ref.kind
            }
        ).sort({"metadata.spec_version": -1}).limit(1).toArray()
        if (result[0]) {
            return result[0].metadata.spec_version
        } else {
            return 0
        }
    }

    async check_spec_version_exists(metadata: Metadata, spec_version: number): Promise<boolean> {
        const result = await this.collection.findOne(
            {
                "metadata.uuid": metadata.uuid,
                "metadata.provider_prefix": metadata.provider_prefix,
                "metadata.provider_version": metadata.provider_version,
                "metadata.kind": metadata.kind,
                "metadata.spec_version": spec_version
            }
        );
        return result !== null;

    }
}
