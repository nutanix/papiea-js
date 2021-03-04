import { PapieaResponse } from "papiea-core";
import {
    EntityNotFoundError,
    ConflictingEntityError,
    GraveyardConflictingEntityError
} from "../databases/utils/errors"
import { ValidationError } from "./validation_error";
import { ProcedureInvocationError } from "./procedure_invocation_error";
import { PermissionDeniedError, UnauthorizedError } from "./permission_error";
import { BadRequestError } from "./bad_request_error";
import { PapieaError } from "papiea-core";
import {Logger} from "papiea-backend-utils"
import { PapieaException } from "./papiea_exception"
import { OnActionError } from "./on_action_error";

export class PapieaErrorResponseGenerator implements PapieaResponse {
    error: {
        url: string,
        engine_version: string,
        code: number
        message: string,
        cause: any
    }

    constructor(url: string, papieaVersion: string, code: number, message: string, cause: any) {
        this.error = {
            url,
            engine_version: papieaVersion,
            code,
            message,
            cause
        }
    }

    public toString() {
        let logging_error_str: string = "\n"

        // Append URL in error logging string
        logging_error_str = logging_error_str + `URL: ${this.error.url}\n`;

        // Append Papiea engine version in error logging string
        logging_error_str = logging_error_str + `Engine Version: ${this.error.engine_version}\n`

        // Append error code in error logging string
        logging_error_str = logging_error_str + `Status Code: ${this.error.code}\n`

        // Append error message in error logging string
        logging_error_str = logging_error_str + `Error: ${this.error.message}\n`

        if (this.error.cause !== undefined && this.error.cause instanceof PapieaException) {
            const papiea_exception = this.error.cause as PapieaException

            // Append entity information in error logging string
            if (papiea_exception.entity_info !== undefined && Object.keys(papiea_exception.entity_info).length) {
                logging_error_str = logging_error_str + `Exception Context: ${papiea_exception.entity_info.toString()}\n`;
            }

            // Append error stack trace in error logging string
            logging_error_str = logging_error_str + `Error Stacktrace:\n${papiea_exception.getDetailedStackTrace()}`
        } else {
            logging_error_str = logging_error_str + `Error Details:\n${this.error.cause.toString()}`
        }

        return logging_error_str
    }

    public get status(): number {
        return this.error.code
    }

    public toResponse(): { [key: string]: any } {
        if (this.error.cause !== undefined && this.error.cause instanceof PapieaException) {
            const papiea_exception = this.error.cause as PapieaException
            return {
                error: {
                    url: this.error.url,
                    engine_version: this.error.engine_version,
                    code: this.error.code,
                    message: this.error.message,
                    type: papiea_exception.name,
                    papiea_context: papiea_exception.entity_info.toResponse(),
                    error_details: papiea_exception.toResponse()
                }
            }
        }
        return {
            error: {
                url: this.error.url,
                engine_version: this.error.engine_version,
                code: this.error.code,
                message: this.error.message,
                cause: this.error.cause
            }
        }
    }

    static create(logger: Logger): (err: any, req: any, papieaVersion: string) => PapieaErrorResponseGenerator {
        return (err: any, req: any, papieaVersion: string) => {
            let status_code: number
            let message: string
            switch (err.constructor) {
                case BadRequestError:
                    status_code = 400
                    message = "Bad Request"
                    break
                case ValidationError:
                    status_code = 400
                    message = "Validation Failed"
                    break
                case ProcedureInvocationError:
                    status_code = (err as ProcedureInvocationError).status
                    message = "Procedure Invocation Failed"
                    break
                case EntityNotFoundError:
                    status_code = 404
                    message = "Entity Not Found"
                    break
                case UnauthorizedError:
                    status_code = 401
                    message = "Unauthorized"
                    break
                case PermissionDeniedError:
                    status_code = 403
                    message = "Permission Denied"
                    break
                case GraveyardConflictingEntityError:
                    status_code = 409
                    message = "Deleted Entity Conflict Error"
                    break
                case ConflictingEntityError:
                    status_code = 409
                    message = "Conflicting Entity Error"
                    break
                case OnActionError:
                    status_code = 500
                    message = "On Action Error"
                    break
                case PapieaException:
                    status_code = 500
                    message = "Papiea Exception"
                    break
                default:
                    status_code = 500
                    message = "Server Error"
                    err.name = PapieaError.ServerError
                    break
            }
            return new PapieaErrorResponseGenerator(req.url, papieaVersion, status_code, message, err)
        }
    }
}
