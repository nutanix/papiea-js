import { PapieaException } from "./papiea_exception";
import { PapieaError, PapieaErrorDetails } from "papiea-core"

export class ValidationError extends PapieaException {
    errors: Error[]

    constructor(error: PapieaErrorDetails, errors?: Error[]) {
        super(error);
        this.name = PapieaError.Validation
        this.errors = errors!
        Object.setPrototypeOf(this, ValidationError.prototype);
    }

    getDetailedMessage(): string {
        let cause_message: string = ""
        if (this.cause !== undefined && this.cause instanceof PapieaException) {
            cause_message = this.cause.getDetailedMessage() ?? ""
        } else if (this.errors !== undefined && this.errors.length) {
            cause_message = cause_message + this.errors.map(error => {
                return (cause_message !== "" ? "\n" : "") + error.message
            })
        }
        return this.message + (cause_message !== "" ? "\n\t" + cause_message : "")
    }

    getDetailedStackTrace(): string {
        let cause_stack: string = ""
        if (this.cause !== undefined && this.cause instanceof PapieaException) {
            cause_stack = this.cause.getDetailedStackTrace() + "\n" ?? ""
        } else if (this.errors !== undefined && this.errors.length) {
            cause_stack = cause_stack + this.errors.map(error => {
                return error.stack + "\n"
            })
        }
        return this.stack! + "\ncaused by error(s)\n[\n" + cause_stack + "]"
    }

    getDetails(): { [key: string]: any } {
        let cause: any
        if (this.cause !== undefined && this.cause instanceof PapieaException) {
            cause = this.cause.getDetails() ?? {}
        } else if (this.errors !== undefined && this.errors.length) {
            cause = {
                "errors": this.errors.map(error => {
                    return { "message": error.message }
                })
            }
        }
        return {
            "type": this.name,
            "message": this.message,
            "entity_info": this.entity_info.toResponse(),
            "cause": cause
        }
    }
}