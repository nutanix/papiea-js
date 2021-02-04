import {EntityCreationResult, EntityCreationStrategy} from "./entity_creation_strategy_interface"
import {IntentfulBehaviour, IntentWatcher, Metadata, Spec, Status} from "papiea-core"
import {create_entry} from "../../intentful_engine/watchlist"
import {Spec_DB} from "../../databases/spec_db_interface"
import {Status_DB} from "../../databases/status_db_interface"
import {Graveyard_DB} from "../../databases/graveyard_db_interface"
import {Watchlist_DB} from "../../databases/watchlist_db_interface"
import {Validator} from "../../validator"
import {Authorizer} from "../../auth/authz"
import {RequestContext, spanOperation} from "papiea-backend-utils"
import {ValidationError} from "../../errors/validation_error"

export class BasicEntityCreationStrategy extends EntityCreationStrategy {
    public async create(input: {metadata: Metadata, spec: Spec}, ctx: RequestContext): Promise<EntityCreationResult> {
        const metadata = await this.create_metadata(input.metadata ?? {})
        if (input.spec === undefined || input.spec === null) {
            throw new ValidationError([new Error("Spec was not provided or was provided in an incorrect format")])
        }
        await this.validate_entity({metadata, spec: input.spec, status: input.spec})
        const span = spanOperation(`save_entity_db`,
                                   ctx.tracing_ctx)
        const [created_metadata, spec] = await this.create_entity(metadata, input.spec)
        span.finish()
        if (this.kind?.intentful_behaviour === IntentfulBehaviour.Differ) {
            const watchlist = await this.watchlistDb.get_watchlist()
            const ent = create_entry(created_metadata)
            if (!watchlist.has(ent)) {
                watchlist.set([ent, []])
                await this.watchlistDb.update_watchlist(watchlist)
            }
        }
        return {
            intent_watcher: null,
            metadata: created_metadata,
            spec: spec,
            status: spec
        }
    }

    public constructor(specDb: Spec_DB, statusDb: Status_DB, graveyardDb: Graveyard_DB, watchlistDb: Watchlist_DB, validator: Validator, authorizer: Authorizer) {
        super(specDb, statusDb, graveyardDb, watchlistDb, validator, authorizer)
    }
}
