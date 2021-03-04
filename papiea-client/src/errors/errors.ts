import { PapieaError } from "papiea-core"

export class PapieaErrorImpl extends Error {
    original_error: Error

    constructor(message: string, e: any) {
        super(message)
        this.original_error = e
    }

}

// Base exception received from papiea
export class PapieaException extends PapieaErrorImpl {
    constructor(message: string, e: any) {
        super(message, e)
        this.name = PapieaError.PapieaException
    }
}

// Spec with this version already exists
export class ConflictingEntityError extends PapieaErrorImpl {
    constructor(message: string, e: any) {
        super(message, e)
        this.name = PapieaError.ConflictingEntity
    }
}

// Entity not found on papiea
export class EntityNotFoundError extends PapieaErrorImpl {
    constructor(message: string, e: any) {
        super(message, e)
        this.name = PapieaError.EntityNotFound
    }
}

// Token provided doesn't have access rights for the operation
export class PermissionDeniedError extends PapieaErrorImpl {
    constructor(message: string, e: any) {
        super(message, e)
        this.name = PapieaError.PermissionDenied
    }
}

// Error in procedure handler
export class ProcedureInvocationError extends PapieaErrorImpl {
    constructor(message: string, e: any) {
        super(message, e)
        this.name = PapieaError.ProcedureInvocation
    }
}

// No auth token provided in Authorization header
export class UnauthorizedError extends PapieaErrorImpl {
    constructor(message: string, e: any) {
        super(message, e)
        this.name = PapieaError.Unauthorized
    }
}

// Entity spec/status didn't pass validation
export class ValidationError extends PapieaErrorImpl {
    constructor(message: string, e: any) {
        super(message, e)
        this.name = PapieaError.Validation
    }
}

// Wrong data on the request side
export class BadRequestError extends PapieaErrorImpl {
    constructor(message: string, e: any) {
        super(message, e)
        this.name = PapieaError.BadRequest
    }
}

// Error in on_create/on_delete/intent handlers
export class OnActionError extends PapieaErrorImpl {
    constructor(message: string, e: any) {
        super(message, e)
        this.name = PapieaError.OnActionError
    }
}
// Something went wrong on papiea
export class PapieaServerError extends PapieaErrorImpl {
    constructor(message: string, e: any) {
        super(message, e)
        this.name = PapieaError.ServerError
    }
}