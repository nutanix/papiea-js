import {EntityCreationStrategy} from "./entity_creation_strategy_interface"
import {IntentfulBehaviour, IntentWatcher, Metadata, Spec, Status} from "papiea-core"
import {create_entry} from "../../intentful_engine/watchlist"
import {Spec_DB} from "../../databases/spec_db_interface"
import {Status_DB} from "../../databases/status_db_interface"
import {Graveyard_DB} from "../../databases/graveyard_db_interface"
import {Watchlist_DB} from "../../databases/watchlist_db_interface"
import {Validator} from "../../validator"

export class BasicEntityCreationStrategy extends EntityCreationStrategy {
    public async create(input: { metadata: Metadata, spec: Spec }): Promise<[IntentWatcher | null, [Metadata, Spec, Status]]> {
        const [created_metadata, spec] = await this.create_entity(input.metadata, input.spec)
        if (this.kind?.intentful_behaviour === IntentfulBehaviour.Differ) {
            const watchlist = await this.watchlistDb.get_watchlist()
            const ent = create_entry(created_metadata)
            if (!watchlist.has(ent)) {
                watchlist.set([ent, []])
                await this.watchlistDb.update_watchlist(watchlist)
            }
        }
        return [null, [created_metadata, spec, null]]
    }

    public constructor(specDb: Spec_DB, statusDb: Status_DB, graveyardDb: Graveyard_DB, watchlistDb: Watchlist_DB, validator: Validator) {
        super(specDb, statusDb, graveyardDb, watchlistDb, validator)
    }
}
