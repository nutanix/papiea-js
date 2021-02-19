import { PapieaExceptionContext } from "papiea-core"

export class PapieaException extends Error {
    entity_info: PapieaExceptionContextImpl;

    constructor(message: string, exceptionContext: PapieaExceptionContext = {}) {
        super(message);
        this.entity_info = new PapieaExceptionContextImpl(exceptionContext.provider_prefix, exceptionContext.provider_version, exceptionContext.kind_name, exceptionContext.additional_info);
    }

    toErrors(): { [key: string]: any }[] {
        return [{ message: this.message }]
    }
}

export class PapieaExceptionContextImpl implements PapieaExceptionContext {
    provider_prefix?: string;
    provider_version?: string;
    kind_name?: string;
    additional_info?: { [key: string]: string; };

    constructor(provider_prefix: string = '', provider_version: string = '', kind_name: string = '', additional_info: { [key: string]: string; } = {}) {
        this.provider_prefix = provider_prefix;
        this.provider_version = provider_version;
        this.kind_name = kind_name;
        this.additional_info = additional_info;
    }

    toResponse(): { [key: string]: any } {
        let entity_info_response: { [key: string]: any} = {};

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
}