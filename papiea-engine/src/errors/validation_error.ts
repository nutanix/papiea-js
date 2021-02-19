import { PapieaException } from "./papiea_exception";
import { PapieaExceptionContext } from "papiea-core"

export class ValidationError extends PapieaException {
    errors: string[];

    constructor(errors: Error[], context: PapieaExceptionContext = {}) {
        const messages = errors.map(x => x.message);
        super(JSON.stringify(messages), context);
        Object.setPrototypeOf(this, ValidationError.prototype);
        this.errors = messages;
    }

    toErrors(): { [key: string]: any }[] {
        return this.errors.map(description => {
            return { message: description }
        });
    }
}