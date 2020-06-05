import { Status_DB } from "./status_db_interface";
import { Db, Collection } from "mongodb";
import { datestringToFilter } from "./utils/date";
import { encode } from "mongo-dot-notation-tool"
import { Entity_Reference, Status, Metadata, Entity } from "papiea-core";
import { SortParams } from "../entity/entity_api_impl";
import { Logger } from "papiea-backend-utils";
import { deepMerge } from "../utils/utils"

export class Status_DB_Mongo implements Status_DB {
    collection: Collection;
    logger: Logger

    constructor(logger: Logger, db: Db) {
        this.collection = db.collection("entity");
        this.logger = logger;
    }

    async init(): Promise<void> {
        await this.collection.createIndex(
            { "metadata.uuid": 1 },
            { name: "entity_uuid", unique: true }
        );
    }

    async replace_status(entity_ref: Entity_Reference, status: Status): Promise<void> {
        const result = await this.collection.updateOne({
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
            throw new Error(`Amount of updated entries doesn't equal to 1: ${result.result.n}`)
        }
    }

    async update_status(entity_ref: Entity_Reference, status: Status): Promise<void> {
        const partial_status_query = encode({"status": status});
        const result = await this.collection.updateOne({
            "metadata.uuid": entity_ref.uuid,
            "metadata.kind": entity_ref.kind
        }, {
                $set: partial_status_query
            });
        if (result.result.n !== 1) {
            throw new Error(`Amount of updated entries doesn't equal to 1: ${result.result.n}`)
        }
    }

    async get_status(entity_ref: Entity_Reference): Promise<[Metadata, Status]> {
        const result: Entity | null = await this.collection.findOne({
            "metadata.uuid": entity_ref.uuid,
            "metadata.kind": entity_ref.kind
        });
        if (result === null) {
            throw new Error("Not found")
        }
        return [result.metadata, result.status]
    }

    async get_statuses_by_ref(entity_refs: Entity_Reference[]): Promise<[Metadata, Status][]> {
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
                throw new Error("No valid entities found");
            }
        });
    }

    async list_status(fields_map: any, sortParams?: SortParams): Promise<([Metadata, Status])[]> {
        let filter: any = {};
        if (fields_map.metadata && fields_map.metadata.deleted_at) {
            filter["metadata.deleted_at"] = datestringToFilter(fields_map.metadata.deleted_at);
        }
        for (let key in fields_map.metadata) {
            if (key === "deleted_at")
                continue;
            filter["metadata." + key] = fields_map.metadata[key];
        }
        filter = deepMerge(
            filter,
            encode({spec: fields_map.spec}),
            encode({status: fields_map.status})
        )
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
                throw new Error("No entities found")
            }
        });
    }

    async list_status_in(filter_list: any[], field_name: string = "metadata.uuid"): Promise<([Metadata, Status])[]> {
        const result = await this.collection.find({ [field_name]: { $in: filter_list } }).sort({ "metadata.uuid": 1 }).toArray();
        return result.map((x: any): [Metadata, Status] => {
            if (x.status !== null) {
                return [x.metadata, x.status]
            } else {
                throw new Error("No valid entities found");
            }
        });
    }

    async delete_status(entity_ref: Entity_Reference): Promise<void> {
        const result = await this.collection.updateOne({
            "metadata.uuid": entity_ref.uuid,
            "metadata.kind": entity_ref.kind
        }, {
                $set: {
                    "metadata.deleted_at": new Date()
                }
            });
        if (result.result.n === undefined || result.result.ok !== 1) {
            throw new Error("Failed to remove status");
        }
        if (result.result.n !== 1 && result.result.n !== 0) {
            throw new Error("Amount of entities must be 0 or 1");
        }
        return;
    }
}
