import {MongoClient, Db} from "mongodb";
import {Spec_DB_Mongo} from "./spec_db_mongo";
import {Status_DB_Mongo} from "./status_db_mongo";
import ProviderDbMongo from "./provider_db_mongo";

export class MongoConnection {
    url: string;
    dbName: string;
    client: MongoClient;
    db: Db | undefined;
    specDb: Spec_DB_Mongo | undefined;
    providerDb: ProviderDbMongo | undefined;
    statusDb: Status_DB_Mongo | undefined;

    constructor(url: string, dbName: string) {
        this.url = url;
        this.dbName = dbName;
        this.client = new MongoClient(this.url, {useNewUrlParser: true});
        this.db = undefined;
        this.specDb = undefined;
        this.providerDb = undefined;
        this.statusDb = undefined;
    }

    connect(cb: (error?: Error) => void): void {
        this.client.connect((err, result) => {
            if (err)
                return cb(err);
            this.db = this.client.db(this.dbName);
            cb();
        });
    }

    close(cb: (error?: Error) => void) {
        this.client.close(true, cb);
    }

    async get_spec_db(): Promise<Spec_DB_Mongo> {
        if (this.specDb !== undefined)
            return this.specDb;
        if (this.db === undefined)
            throw new Error("Not connected");
        this.specDb = new Spec_DB_Mongo(this.db);
        await this.specDb.init();
        return this.specDb;
    }

    async get_provider_db(): Promise<ProviderDbMongo> {
        if (this.providerDb !== undefined)
            return this.providerDb;
        if (this.db === undefined)
            throw new Error("Not connected");
        this.providerDb = new ProviderDbMongo(this.db);
        await this.providerDb.init();
        return this.providerDb;
    }

    async get_status_db(): Promise<Status_DB_Mongo> {
        if (this.statusDb !== undefined)
            return this.statusDb;
        if (this.db === undefined)
            throw new Error("Not connected");
        this.statusDb = new Status_DB_Mongo(this.db);
        await this.statusDb.init();
        return this.statusDb;
    }
}