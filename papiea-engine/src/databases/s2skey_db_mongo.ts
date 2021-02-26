import { S2S_Key_DB } from "./s2skey_db_interface";
import { S2S_Key, Secret } from "papiea-core";
import { Collection, Db } from "mongodb";
import { datestringToFilter } from "./utils/date";
import { Logger } from "papiea-backend-utils";
import { PapieaException } from "../errors/papiea_exception";

export class S2S_Key_DB_Mongo implements S2S_Key_DB {
    collection: Collection;
    logger: Logger;

    constructor(logger: Logger, db: Db) {
        this.collection = db.collection("s2skey");
        this.logger = logger;
    }

    async init(): Promise<void> {
        try {
            await this.collection.createIndex(
                { "key": 1 },
                { name: "key", unique: true },
            );
            await this.collection.createIndex(
                { "owner": 1, "provider_prefix": 1 },
                { name: "user_provider_keys", unique: false },
            );
            await this.collection.createIndex(
                { "uuid": 1 },
                { name: "uuid", unique: true },
            )
        } catch (err) {
            throw new PapieaException({ message: "Failed to setup the S2S key database.", cause: err })
        }
    }

    async create_key(s2skey: S2S_Key): Promise<void> {
        s2skey.created_at = new Date();
        s2skey.deleted_at = undefined;
        await this.collection.insertOne(s2skey);
        return;
    }

    async get_key(uuid: string): Promise<S2S_Key> {
        const result: S2S_Key | null = await this.collection.findOne({
            "uuid": uuid,
            "deleted_at": null
        });
        if (result === null) {
            throw new PapieaException({ message: "MongoDBError: S2S key not found." });
        }
        return result;
    }

    async get_key_by_secret(secret: Secret): Promise<S2S_Key> {
        const result: S2S_Key | null = await this.collection.findOne({
            "key": secret,
            "deleted_at": null
        });
        if (result === null) {
            throw new PapieaException({ message: "MongoDBError: S2S key not found." });
        }
        return result;
    }


    async list_keys(fields_map: any): Promise<S2S_Key[]> {
        const filter: any = Object.assign({}, fields_map);
        filter["deleted_at"] = datestringToFilter(fields_map.deleted_at);
        const result = await this.collection.find(filter).toArray();
        return result;
    }

    async inactivate_key(uuid: string): Promise<void> {
        const result = await this.collection.updateOne({
            "uuid": uuid
        }, {
                $set: {
                    "deleted_at": new Date()
                }
            });
        if (result.result.n === undefined || result.result.ok !== 1) {
            throw new PapieaException({ message: "MongoDBError: Failed to inactivate S2S key." });
        }
        if (result.result.n !== 1 && result.result.n !== 0) {
            throw new PapieaException({ message: `MongoDBError: Amount of S2S key inactivated must be 0 or 1, found ${result.result.n} keys.` });
        }
        return;
    }
}
