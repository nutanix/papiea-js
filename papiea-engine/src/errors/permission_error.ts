import { PapieaException } from "./papiea_exception";
import { PapieaExceptionContext } from "papiea-core"

export class PermissionDeniedError extends PapieaException {
    message: string;

    constructor(message: string, context: PapieaExceptionContext = {}) {
        super("Permission Denied", context);
        this.message = message;
        Object.setPrototypeOf(this, PermissionDeniedError.prototype);
    }

    toErrors(): { [key: string]: any }[] {
        return [{ message: this.message }];
    }
}

export class UnauthorizedError extends PapieaException {
    message: string;

    constructor(message: string, context: PapieaExceptionContext = {}) {
        super("Unauthorized", context);
        this.message = message;
        Object.setPrototypeOf(this, UnauthorizedError.prototype);
    }

    toErrors(): { [key: string]: any }[] {
        return [{ message: this.message }];
    }
}