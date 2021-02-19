import { Spec, uuid4, Metadata, Status } from "papiea-core";
import { PapieaException } from "../../errors/papiea_exception"

export class ConflictingEntityError extends PapieaException {

    existing_metadata: Metadata;
    existing_spec: Spec;
    existing_status?: Status

    constructor(msg: string, metadata: Metadata, spec: Spec, status?: Status) {
        super(msg, {provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid }});
        this.existing_metadata = metadata;
        this.existing_spec = spec;
        this.existing_status = status
    }
}

export class GraveyardConflictingEntityError extends ConflictingEntityError {
    private static MESSAGE = "Deleted entity with this uuid and spec version exists"

    highest_spec_version: number

    constructor(metadata: Metadata, spec: Spec, highest_spec_version: number, status?: Status) {
        super(GraveyardConflictingEntityError.MESSAGE, metadata, spec, status);
        this.highest_spec_version = highest_spec_version
    }
}

export class EntityNotFoundError extends PapieaException {

    uuid: uuid4;
    kind: string;

    constructor(kind: string, uuid: uuid4, provider_prefix: string = '', provider_version: string = '') {
        super('Entity Not Found', { provider_prefix: provider_prefix, provider_version: provider_version, kind_name: kind, additional_info: { "entity_uuid": uuid }});
        this.kind = kind;
        this.uuid = uuid;
    }

    toErrors(): { [key: string]: any }[] {
        return [{ message: `Entity ${this.uuid} not found` }]
    }
}
