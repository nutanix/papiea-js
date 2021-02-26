import { Collection, Db } from "mongodb";
import { SessionKeyDb } from "./session_key_db_interface"
import { SessionKey, Secret } from "papiea-core"
import { Logger } from "papiea-backend-utils"
import { PapieaException } from "../errors/papiea_exception";

export class SessionKeyDbMongo implements SessionKeyDb {
    collection: Collection;
    logger: Logger;

    constructor(logger: Logger, db: Db) {
        this.collection = db.collection("session_key");
        this.logger = logger;
    }

    async init(): Promise<void> {
        try {
            await this.collection.createIndex(
                { "key": 1 },
                { name: "key", unique: true },
            );
            await this.collection.createIndex(
                { "expireAt": 1 },
                { expireAfterSeconds: 60 * 60 * 24 * 3 },
            );
        } catch (err) {
            throw new PapieaException({ message: "Failed to setup the session key database.", cause: err })
        }
    }

    async create_key(sessionKey: SessionKey): Promise<void> {
        await this.collection.insertOne(sessionKey);
        return;
    }

    async get_key(key: Secret): Promise<SessionKey> {
        const result: SessionKey | null = await this.collection.findOne({
            "key": key,
        });
        if (result === null) {
            throw new PapieaException({ message: "MongoDBError: Session key not found." });
        }
        return result;
    }

    async inactivate_key(key: Secret): Promise<void> {
        const result = await this.collection.deleteOne({
            "key": key
        }, );
        if (result.result.n === undefined || result.result.ok !== 1) {
            throw new PapieaException({ message: "MongoDBError: Failed to inactivate session key." });
        }
        if (result.result.n !== 1 && result.result.n !== 0) {
            throw new PapieaException({ message: `MongoDBError: Amount of session key inactivated must be 0 or 1, found ${result.result.n}.` });
        }
        return;
    }

    async update_key(key: Secret, query: any): Promise<void> {
        const result = await this.collection.updateOne({
            "key": key
        }, {
            $set: query
        })
        if (result.result.n !== 1) {
            throw new PapieaException({ message: `MongoDBError: Amount of session key updated should equal to 1, found ${result.result.n} entries.` })
        }
    }
}
