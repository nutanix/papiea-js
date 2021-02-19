import { PapieaException } from "./papiea_exception";
import { PapieaExceptionContext } from "papiea-core"

export class OnActionError extends PapieaException {
    static ON_CREATE_ACTION_MSG = "On Create couldn't be called;"
    static ON_DELETE_ACTION_MSG = "On Delete couldn't be called;"
    static UNKNOWN_ACTION_MSG = "Action couldn't be called;"

    message: string;

    constructor(message: string, context: PapieaExceptionContext) {
        super(message, context)
        this.message = message
    }

    public static create(reason: string, procedure_name: string, context: PapieaExceptionContext = {}) {
        if (context.kind_name === undefined || context.kind_name === null) {
            return new OnActionError(`${this.UNKNOWN_ACTION_MSG} ${reason}`, context)
        }
        const on_create = OnActionError.onCreateName(context.kind_name)
        const on_delete = OnActionError.onDeleteName(context.kind_name)
        let message: string
        if (procedure_name === on_create) {
            message = `${this.ON_CREATE_ACTION_MSG} ${reason}`
        } else if (procedure_name === on_delete) {
            message = `${this.ON_DELETE_ACTION_MSG} ${reason}`
        } else {
            message = `${this.UNKNOWN_ACTION_MSG} ${reason}`
        }
        return new OnActionError(message, context)
    }

    private static onCreateName(kind_name: string) {
        return `__${kind_name}_create`
    }

    private static onDeleteName(kind_name: string) {
        return `__${kind_name}_delete`
    }

    toErrors(): { [key: string]: any }[] {
        return [{ message: this.message }]
    }
}
