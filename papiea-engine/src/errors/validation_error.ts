import { PapieaException } from "./papiea_exception";
import { PapieaError, PapieaErrorDetails } from "papiea-core"

export class ValidationError extends PapieaException {

    constructor(error: PapieaErrorDetails) {
        super(error);
        this.name = PapieaError.Validation
        Object.setPrototypeOf(this, ValidationError.prototype);
    }

}