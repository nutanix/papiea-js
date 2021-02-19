export class PapieaErrorImpl extends Error {
    original_error: Error

    constructor(message: string, e: Error) {
        super(message)
        this.original_error = e
    }

}

// Base exception received from papiea
export class PapieaException extends PapieaErrorImpl {

}

// Spec with this version already exists
export class ConflictingEntityError extends PapieaErrorImpl {

}

// Entity not found on papiea
export class EntityNotFoundError extends PapieaErrorImpl {

}

// Token provided doesn't have access rights for the operation
export class PermissionDeniedError extends PapieaErrorImpl {

}

// Error in procedure handler
export class ProcedureInvocationError extends PapieaErrorImpl {

}

// No auth token provided in Authorization header
export class UnauthorizedError extends PapieaErrorImpl {

}

// Entity spec/status didn't pass validation
export class ValidationError extends PapieaErrorImpl {

}

// Wrong data on the request side
export class BadRequestError extends PapieaErrorImpl {

}

// Something went wrong on papiea
export class PapieaServerError extends PapieaErrorImpl {

}