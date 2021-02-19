import { ValidationError } from "./validation_error"
import { AxiosError } from "axios"
import { isAxiosError } from "../utils/utils"
import { PapieaException, PapieaExceptionContextImpl } from "./papiea_exception";
import { PapieaExceptionContext} from "papiea-core"

export class ProcedureInvocationError extends PapieaException {
    errors: { [key: string]: any }[];
    status: number;

    protected constructor(errors: { [key: string]: any }[], status: number, context: PapieaExceptionContext = {}) {
        const messages = errors.map(x => x.message);
        super(JSON.stringify(messages), context);
        Object.setPrototypeOf(this, ProcedureInvocationError.prototype);
        this.errors = errors;
        this.status = status;
        this.name = "ProcedureInvocationError";
    }

    static fromError(err: AxiosError, context?: PapieaExceptionContext, status?: number): ProcedureInvocationError
    static fromError(err: ValidationError, context?: PapieaExceptionContext, status?: number): ProcedureInvocationError
    static fromError(err: Error, context?: PapieaExceptionContext, status?: number): ProcedureInvocationError {
        if (isAxiosError(err)) {
            return new ProcedureInvocationError([{
                message: err.response?.data.message,
                errors: err.response?.data.errors,
                stacktrace: err.response?.data.stacktrace
            }], err.response?.status ?? 500, context!)
        } else if (err instanceof ValidationError) {
            return new ProcedureInvocationError(
                err.errors.map(e => ({
                    message: e,
                    errors: {},
                    stacktrace: err.stack
                }))
            , status || 500, context!)
        } else {
            return new ProcedureInvocationError([{
                message: "Unknown error during procedure invocation",
                errors: {},
                stacktrace: err.stack
            }], status || 500, context!)
        }
    }

    toErrors(): { [key: string]: any }[] {
        return this.errors;
    }
}
