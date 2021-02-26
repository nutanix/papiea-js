import { ValidationError } from "./validation_error"
import { AxiosError } from "axios"
import { isAxiosError, convertAxiosErrorToEngineError } from "../utils/utils"
import { PapieaException } from "./papiea_exception";
import { PapieaExceptionContext, PapieaErrorDetails, PapieaError} from "papiea-core"

export class ProcedureInvocationError extends PapieaException {
    status: number

    constructor(error: PapieaErrorDetails, status: number) {
        super(error);
        this.status = status
        this.name = PapieaError.ProcedureInvocation
        Object.setPrototypeOf(this, ProcedureInvocationError.prototype);
    }

    static fromError(err: AxiosError, context?: PapieaExceptionContext, status?: number): ProcedureInvocationError
    static fromError(err: ValidationError, context?: PapieaExceptionContext, status?: number): ProcedureInvocationError
    static fromError(err: Error, context?: PapieaExceptionContext, status?: number): ProcedureInvocationError {
        if (isAxiosError(err)) {
            return new ProcedureInvocationError({
                message: "Failed to execute the procedure",
                entity_info: context!,
                cause: convertAxiosErrorToEngineError(err.response?.data.error)
            }, err.response?.status ?? 500)
        } else if (err instanceof ValidationError) {
            return new ProcedureInvocationError({
                message: "Validation failed for procedure input/output",
                entity_info: context!,
                cause: err
            }, status || 500)
        } else {
            return new ProcedureInvocationError({
                message: "Unknown error during procedure invocation",
                entity_info: context!,
                cause: err
            }, status || 500)
        }
    }

}