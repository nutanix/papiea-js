import { PapieaException } from "./papiea_exception";
import { PapieaErrorDetails, PapieaError } from "papiea-core"

export class OnActionError extends PapieaException {

    constructor(error: PapieaErrorDetails) {
        super(error);
        this.name = PapieaError.OnActionError
        Object.setPrototypeOf(this, OnActionError.prototype);
    }

}
