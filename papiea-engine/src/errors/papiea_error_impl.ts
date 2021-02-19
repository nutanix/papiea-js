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
import {PapieaExceptionContextImpl, PapieaException} from "../errors/papiea_exception"
import { OnActionError } from "./on_action_error";

export class PapieaErrorResponseImpl implements PapieaResponse {
    error: {
        url: string,
        errors: { [key: string]: any }[],
        code: number
        message: string,
        type: PapieaError,
        entity_info: { [key: string]: any }
    }

    constructor(url: string, code: number, errorMsg: string, type: PapieaError, entity_context: PapieaExceptionContextImpl = new PapieaExceptionContextImpl(), errors?: { [key: string]: any }[]) {
        if (errors) {
            this.error = {
                url,
                code,
                errors,
                message: errorMsg,
                type,
                entity_info: entity_context.toResponse()
            }
        } else {
            this.error = {
                url,
                code,
                errors: [
                    { message: errorMsg }
                ],
                message: errorMsg,
                type,
                entity_info: entity_context.toResponse()
            }
        }

    }

    public toString() {
        const error_details = this.error.errors.reduce((acc, current) => {
            for (let prop in current) {
                acc = `${acc}; 
                Cause: ${prop} - Error: ${current[prop]}`
            }
            return acc
        }, "")

        if (this.error.entity_info === null || this.error.entity_info === undefined || Object.keys(this.error.entity_info).length === 0) {
            return `URL: ${this.error.url}\nError msg: ${this.error.message}.\nDetails: ${error_details}`    
        }
        return `URL: ${this.error.url}\nEntity Information: ${JSON.stringify(this.error.entity_info)}\nError msg: ${this.error.message}.\nDetails: ${error_details}`
    }

    public get status(): number {
        return this.error.code
    }

    public toResponse() {
        return this
    }

    static create(logger: Logger): (err: Error, req: any) => PapieaErrorResponseImpl {
        return (err: Error, req: any) => {
            switch (err.constructor) {
                case BadRequestError:
                    return new PapieaErrorResponseImpl(req.url, 400, "Bad Request", PapieaError.BadRequest, (err as BadRequestError).entity_info,
                                                       (err as BadRequestError).toErrors())
                case ValidationError:
                    return new PapieaErrorResponseImpl(req.url, 400, "Validation failed.", PapieaError.Validation, (err as ValidationError).entity_info, (err as ValidationError).toErrors())
                case ProcedureInvocationError:
                    return new PapieaErrorResponseImpl(req.url, (err as ProcedureInvocationError).status, "Procedure invocation failed.", PapieaError.ProcedureInvocation, (err as ProcedureInvocationError).entity_info, (err as ProcedureInvocationError).toErrors())
                case EntityNotFoundError:
                    return new PapieaErrorResponseImpl(
                        req.url,
                        404,
                        "Entity not found.",
                        PapieaError.EntityNotFound,
                        (err as EntityNotFoundError).entity_info,
                        (err as EntityNotFoundError).toErrors(),
                    )
                case UnauthorizedError:
                    return new PapieaErrorResponseImpl(req.url, 401, "Unauthorized.", PapieaError.Unauthorized, (err as UnauthorizedError).entity_info, (err as UnauthorizedError).toErrors())
                case PermissionDeniedError:
                    return new PapieaErrorResponseImpl(req.url, 403, "Permission denied.", PapieaError.PermissionDenied, (err as PermissionDeniedError).entity_info, (err as PermissionDeniedError).toErrors())
                case GraveyardConflictingEntityError:
                    let graveyardErr = err as GraveyardConflictingEntityError
                    let meta = graveyardErr.existing_metadata

                    return new PapieaErrorResponseImpl(req.url, 409, `${graveyardErr.message}: uuid - ${meta.uuid}, maximum current spec version - ${graveyardErr.highest_spec_version}`, PapieaError.ConflictingEntity, (err as GraveyardConflictingEntityError).entity_info)
                case ConflictingEntityError:
                    let conflictingError = err as ConflictingEntityError
                    let metadata = conflictingError.existing_metadata

                    return new PapieaErrorResponseImpl(req.url, 409, `Conflicting Entity: ${metadata.uuid}. Existing entity has version ${metadata.spec_version}`, PapieaError.ConflictingEntity, (err as ConflictingEntityError).entity_info)
                case OnActionError:
                    return new PapieaErrorResponseImpl(req.url, 500, "On Action Error", PapieaError.OnActionError, (err as OnActionError).entity_info, (err as OnActionError).toErrors())
                case PapieaException:
                    return new PapieaErrorResponseImpl(req.url, 500, `Papiea Exception`, PapieaError.PapieaException, (err as PapieaException).entity_info, (err as PapieaException).toErrors())
                default:
                    logger.error(`Papiea encountered unexpected error: ${err}`)
                    return new PapieaErrorResponseImpl(req.url, 500, err.message, PapieaError.ServerError)
            }
        }
    }
}
