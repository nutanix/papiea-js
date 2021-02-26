import { Status_DB } from "./status_db_interface";
import { Db, Collection, UpdateWriteOpResult } from "mongodb"
import { Entity_Reference, Status, Metadata, Entity, Provider_Entity_Reference } from "papiea-core";
import { SortParams } from "../entity/entity_api_impl";
import { Logger, dotnotation } from "papiea-backend-utils";
import { build_filter_query } from "./utils/filtering"
import { EntityNotFoundError } from "./utils/errors";
import { PapieaException } from "../errors/papiea_exception"

export class Status_DB_Mongo implements Status_DB {
    collection: Collection;
    logger: Logger

    constructor(logger: Logger, db: Db) {
        this.collection = db.collection("entity");
        this.logger = logger;
    }

    async init(): Promise<void> {

    }

    async replace_status(entity_ref: Provider_Entity_Reference, status: Status): Promise<void> {
        const result = await this.collection.updateOne({
            "metadata.provider_prefix": entity_ref.provider_prefix,
            "metadata.provider_version": entity_ref.provider_version,
            "metadata.uuid": entity_ref.uuid,
            "metadata.kind": entity_ref.kind
        }, {
                $set: {
                    "status": status
                },
                $setOnInsert: {
                    "metadata.created_at": new Date()
                }
            }, {
                upsert: true
            });
        if (result.result.n !== 1) {
            throw new PapieaException({ message: `MongoDBError: Amount of updated status entries should equal to 1, found ${result.result.n} entries for kind: ${entity_ref.provider_prefix}/${entity_ref.provider_version}/${entity_ref.kind},`, entity_info: { provider_prefix: entity_ref.provider_prefix, provider_version: entity_ref.provider_version, kind_name: entity_ref.kind, additional_info: { "entity_uuid": entity_ref.uuid }}})
        }
    }

    async update_status(entity_ref: Provider_Entity_Reference, status: Status): Promise<void> {
        let result: UpdateWriteOpResult
        const partial_status_query = dotnotation({"status": status});

        let aggregrate_fields = []
        const {set_status_fields, unset_status_fields} = separate_null_fields(partial_status_query)
        if (Object.keys(set_status_fields).length !== 0) {
            aggregrate_fields.push({ $set: set_status_fields })
        }
        if (Object.keys(unset_status_fields).length !== 0) {
            aggregrate_fields.push({ $unset: unset_status_fields })
        }

        try {
            result = await this.collection.updateOne(
                {
                    "metadata.provider_prefix": entity_ref.provider_prefix,
                    "metadata.provider_version": entity_ref.provider_version,
                    "metadata.uuid": entity_ref.uuid,
                    "metadata.kind": entity_ref.kind
                }, aggregrate_fields, {
                    upsert: true
                });
        } catch (e) {
            if (e.code === 9) {
                throw new PapieaException({ message: `MongoDBError: Update body might be 'undefined', if this is expected, please use 'null' for kind: ${entity_ref.provider_prefix}/${entity_ref.provider_version}/${entity_ref.kind}.`, entity_info: { provider_prefix: entity_ref.provider_prefix, provider_version: entity_ref.provider_version, kind_name: entity_ref.kind, additional_info: { "entity_uuid": entity_ref.uuid }}})
            }
            throw new PapieaException({ message: `MongoDBError: Something went wrong in update status for entity of kind: ${entity_ref.provider_prefix}/${entity_ref.provider_version}/${entity_ref.kind}.`, entity_info: { provider_prefix: entity_ref.provider_prefix, provider_version: entity_ref.provider_version, kind_name: entity_ref.kind, additional_info: { "entity_uuid": entity_ref.uuid }}, cause: e})
        }
        if (result.result.n !== 1) {
            throw new PapieaException({ message: `MongoDBError: Amount of updated status entries should equal to 1, found ${result.result.n} entries for kind ${entity_ref.provider_prefix}/${entity_ref.provider_version}/${entity_ref.kind}.`, entity_info: { provider_prefix: entity_ref.provider_prefix, provider_version: entity_ref.provider_version, kind_name: entity_ref.kind, additional_info: { "entity_uuid": entity_ref.uuid }}})
        }
    }

    async get_status(entity_ref: Provider_Entity_Reference): Promise<[Metadata, Status]> {
        const result: Entity | null = await this.collection.findOne({
            "metadata.provider_prefix": entity_ref.provider_prefix,
            "metadata.provider_version": entity_ref.provider_version,
            "metadata.uuid": entity_ref.uuid,
            "metadata.kind": entity_ref.kind
        });
        if (result === null) {
            throw new EntityNotFoundError(entity_ref.kind, entity_ref.uuid, entity_ref.provider_prefix, entity_ref.provider_version);
        }
        return [result.metadata, result.status]
    }

    async get_statuses_by_ref(entity_refs: Provider_Entity_Reference[]): Promise<[Metadata, Status][]> {
        const ids = entity_refs.map(ref => ref.uuid)
        const result = await this.collection.find({
            "metadata.uuid": {
                $in: ids
            }
        }).toArray();
        return result.map((x: any): [Metadata, Status] => {
            if (x.spec !== null) {
                return [x.metadata, x.status]
            } else {
                throw new PapieaException({ message: "MongoDBError: No valid entities found for get status by entity reference." });
            }
        });
    }

    async list_status(fields_map: any, exact_match: boolean, sortParams?: SortParams): Promise<([Metadata, Status])[]> {
        const filter = build_filter_query(fields_map, exact_match)
        let result: any[];
        if (sortParams) {
            result = await this.collection.find(filter).sort(sortParams).toArray();
        } else {
            result = await this.collection.find(filter).toArray();
        }
        return result.map((x: any): [Metadata, Status] => {
            if (x.status !== null) {
                return [x.metadata, x.status]
            } else {
                throw new PapieaException({ message: "MongoDBError: No entities found while listing status." })
            }
        });
    }

    async list_status_in(filter_list: any[], field_name: string = "metadata.uuid"): Promise<([Metadata, Status])[]> {
        const result = await this.collection.find({ [field_name]: { $in: filter_list } }).sort({ "metadata.uuid": 1 }).toArray();
        return result.map((x: any): [Metadata, Status] => {
            if (x.status !== null) {
                return [x.metadata, x.status]
            } else {
                throw new PapieaException({ message: "MongoDBError: No valid entities found in list status." });
            }
        });
    }
}

function separate_null_fields(status_dot_notation: any): any {
    let set_fields: any = {}
    let unset_fields: any = []

    for (const key in status_dot_notation) {
        if (status_dot_notation[key] === null) {
            unset_fields.push(key)
        } else {
            set_fields[key] = status_dot_notation[key]
        }
    }
    return { set_status_fields: set_fields,
            unset_status_fields: unset_fields }
}