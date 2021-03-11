import { PapieaExceptionContext, PapieaErrorDetails, PapieaError } from "papiea-core"

export class PapieaException extends Error {
    entity_info: PapieaExceptionContextImpl;
    cause?: any;

    constructor(error: PapieaErrorDetails) {
        super(error.message);
        this.entity_info = new PapieaExceptionContextImpl(error.entity_info?.provider_prefix, error.entity_info?.provider_version, error.entity_info?.kind_name, error.entity_info?.additional_info)
        this.cause = error.cause
        this.name = PapieaError.PapieaException
    }

    getDetailedMessage(): string {
        return this.message + `${ (this.cause !== undefined && this.cause instanceof PapieaException) ? "\n\t" + this.cause.getDetailedMessage() : "" }`
    }

    getDetailedStackTrace(): string {
        return this.stack! + `${ (this.cause !== undefined && this.cause instanceof PapieaException) ? "\ncaused by error\n" + this.cause.getDetailedStackTrace() + "\n" : "" }`
    }

    getDetails(): { [key: string]: any } {
        return {
            "type": this.name,
            "message": this.message,
            "entity_info": this.entity_info.toResponse(),
            "cause": (this.cause !== undefined && this.cause instanceof PapieaException) ? this.cause.getDetails() : {}
        }
    }

    toResponse(): { [key: string]: any } {
        return {
            "type": this.name,
            "message": this.getDetailedMessage(),
            "entity_info": this.entity_info.toResponse(),
            "cause": (this.cause !== undefined && this.cause instanceof PapieaException) ? this.cause.getDetails() : {}
        }
    }
}

export class PapieaExceptionContextImpl implements PapieaExceptionContext {
    provider_prefix: string;
    provider_version: string;
    kind_name: string;
    additional_info: { [key: string]: string; };

    constructor(provider_prefix: string = '', provider_version: string = '', kind_name: string = '', additional_info: { [key: string]: string; } = {}) {
        this.provider_prefix = provider_prefix;
        this.provider_version = provider_version;
        this.kind_name = kind_name;
        this.additional_info = additional_info;
    }

    toResponse(): { [key: string]: any } {
        let entity_info_response: { [key: string]: any } = {};

        if (this.provider_prefix !== '') {
            entity_info_response["provider_prefix"] = this.provider_prefix;
        }
        if (this.provider_version !== '') {
            entity_info_response["provider_version"] = this.provider_version;
        }
        if (this.kind_name !== '') {
            entity_info_response["kind_name"] = this.kind_name;
        }
        if (this.additional_info && Object.keys(this.additional_info).length > 0) {
            for (let field in this.additional_info) {
                entity_info_response[field] = this.additional_info[field]
            }
        }

        return entity_info_response;
    }

    toString(): string {
        return JSON.stringify(this.toResponse())
    }
}