import { PapieaException } from "./papiea_exception";
import { PapieaExceptionContext } from "papiea-core"

export class OnActionError extends PapieaException {
    message: string;

    constructor(message: string, context: PapieaExceptionContext) {
        super(message, context)
        this.message = message
    }

    toErrors(): { [key: string]: any }[] {
        return [{ message: this.message }]
    }
}
