import { Collection, Db } from "mongodb";
import { Logger } from "papiea-backend-utils";
import { Watchlist_DB } from "./watchlist_db_interface";
import { SerializedWatchlist, Watchlist } from "../intentful_engine/watchlist";
import { PapieaException } from "../errors/papiea_exception";

type WatchlistResult = {
    id: number
    watchlist: SerializedWatchlist
}

export class Watchlist_Db_Mongo implements Watchlist_DB {
    collection: Collection;
    logger: Logger

    constructor(logger: Logger, db: Db) {
        this.collection = db.collection("watchlist");
        this.logger = logger;
    }

    async init(): Promise<void> {
        await this.collection.createIndex(
            { "id": 1 },
            { name: "watchlist_id", unique: true }
        );
    }

    async update_watchlist(watchlist: Watchlist): Promise<void> {
        const result = await this.collection.updateOne({
            "id": 1,
        }, {
            $set: {
                watchlist: watchlist.serialize()
            }
        }, {
            upsert: true
        });
        if (result.result.n !== 1) {
            throw new PapieaException(`MongoDBError: Amount of updated entries doesn't equal to 1: ${result.result.n}`)
        }
    }

    async get_watchlist(): Promise<Watchlist> {
        const result: WatchlistResult | null = await this.collection.findOne({
            "id": 1,
        });
        if (result === null) {
            const watchlist = new Watchlist()
            await this.update_watchlist(watchlist)
            return watchlist
        }
        return new Watchlist(result.watchlist)
    }
}
