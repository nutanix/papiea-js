import { PapieaException } from "./papiea_exception";
import { PapieaExceptionContext } from "papiea-core"

export class BadRequestError extends PapieaException {
    message: string;

    constructor(message: string, context: PapieaExceptionContext = {}) {
        super("Bad Request", context);
        this.message = message;
        Object.setPrototypeOf(this, BadRequestError.prototype);
    }

    toErrors(): { [key: string]: any }[] {
        return [{ message: this.message }]
    }
}