import { uuid4, Metadata, PapieaError } from "papiea-core";
import { PapieaException } from "../../errors/papiea_exception"

export class ConflictingEntityError extends PapieaException {

    constructor(msg: string, metadata: any) {
        super({message: msg, entity_info: {provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid, "existing_spec_version": metadata.spec_version.toString() }}});
        this.name = PapieaError.ConflictingEntity
        Object.setPrototypeOf(this, ConflictingEntityError.prototype);
    }
}

export class GraveyardConflictingEntityError extends ConflictingEntityError {

    constructor(metadata: Metadata, highest_spec_version: number) {
        super(`Deleted entity with UUID ${metadata.uuid} of kind: ${metadata.provider_prefix}/${metadata.provider_version}/${metadata.kind} already exists with this spec version.`, metadata);
        Object.setPrototypeOf(this, GraveyardConflictingEntityError.prototype);
        this.entity_info.additional_info["highest_spec_version"] = highest_spec_version.toString()
    }
}

export class EntityNotFoundError extends PapieaException {

    constructor(kind: string, uuid: uuid4, provider_prefix: string = '', provider_version: string = '') {
        super({ message: `Entity with UUID ${uuid} of kind: ${kind} not found. Make sure the entity and kind is correct.`, entity_info: { provider_prefix: provider_prefix, provider_version: provider_version, kind_name: kind, additional_info: { "entity_uuid": uuid }}});
        this.name = PapieaError.EntityNotFound
        Object.setPrototypeOf(this, EntityNotFoundError.prototype);
    }

}
