import { PapieaException } from "./papiea_exception";
import { PapieaErrorDetails, PapieaError } from "papiea-core"

export class PermissionDeniedError extends PapieaException {

    constructor(error: PapieaErrorDetails) {
        super(error);
        this.name = PapieaError.PermissionDenied
        Object.setPrototypeOf(this, PermissionDeniedError.prototype);
    }

}

export class UnauthorizedError extends PapieaException {

    constructor(error: PapieaErrorDetails) {
        super(error);
        this.name = PapieaError.Unauthorized
        Object.setPrototypeOf(this, UnauthorizedError.prototype);
    }

}