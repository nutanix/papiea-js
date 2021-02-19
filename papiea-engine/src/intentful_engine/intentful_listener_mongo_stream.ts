import { Handler, IntentfulListener } from "./intentful_listener_interface";
import { ChangeStream, Collection, ChangeEventUpdate } from "mongodb";
import { Watchlist, create_entry } from "./watchlist";
import { Entity } from "papiea-core";
import { MongoConnection } from "../databases/mongo";

// This is an alternative implementation which works with mongo replica set capabilities
export class IntentfulListenerMongoStream implements IntentfulListener {
    private entityDbCollection: Collection;
    onChange: Handler<(entity: Entity) => Promise<void>>;
    private changeStreamIterator: ChangeStream;
    private watchlist: Watchlist;
    // Maybe we should store it persistently on disk?
    private resumeToken: any | undefined

    constructor(mongoConnection: MongoConnection, watchlist: Watchlist) {
        this.entityDbCollection = mongoConnection.db!.collection("entity")
        this.changeStreamIterator = this.entityDbCollection.watch([
            { $match: { operationType: "update" } }
        ], { fullDocument: 'updateLookup', resumeAfter: this.resumeToken })
        this.onChange = new Handler()
        this.watchlist = watchlist
    }

    public async run() {
        try {
            await this._run()
        } catch (e) {
            console.error(`Run method for intentful listener mongo stream failed: ${e}`)
            throw e
        }
    }

    private specChanged(change_event: any): boolean {
        // TODO: removed fields?
        if (change_event.updateDescription.updatedFields.spec) {
            return true
        }
        return false
    }

    private statusChanged(change_event: any): boolean {
        // TODO: removed fields?

        // Update has changed the whole status object
        // Came in form of { updatedFields: { status: [Object] }}
        if (change_event.updateDescription.updatedFields.status) {
            return true
        }
        // Update has changed status partially
        // Came in form of { updatedFields: { 'status.x': [Object] }}
        for (let key of Object.keys(change_event.updateDescription.updatedFields)) {
            const partial_status = key.split(".")
            if (partial_status[ 0 ] === "status") {
                return true
            }
        }
        return false
    }

    private async watchCollection() {
        this.changeStreamIterator = this.entityDbCollection.watch([
            { $match: { operationType: "update" } }
        ], { fullDocument: 'updateLookup', resumeAfter: this.resumeToken })
        this.changeStreamIterator.on("change", async (change_event) => {
            this.resumeToken = change_event._id
            // TODO: Newer Mongo type defs suggest fullDocument isn't always
            // present, but we're only listening for updates, and we should
            // always get a ChangeEventUpdate.
            const entity: Entity = (<ChangeEventUpdate>change_event).fullDocument
            if (this.watchlist.has(create_entry(entity.metadata))) {
                if (this.specChanged(change_event) || this.statusChanged(change_event)) {
                    await this.onChange.call(entity)
                }
            }
        }).on("error", async (err) => {
            await this.watchCollection()
        })
    }

    private async _run(): Promise<void> {
        await this.watchCollection()
    }
}
