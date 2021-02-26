import { PapieaException } from "./papiea_exception";
import { PapieaErrorDetails, PapieaError } from "papiea-core"

export class BadRequestError extends PapieaException {

    constructor(error: PapieaErrorDetails) {
        super(error);
        this.name = PapieaError.BadRequest
        Object.setPrototypeOf(this, BadRequestError.prototype);
    }

}