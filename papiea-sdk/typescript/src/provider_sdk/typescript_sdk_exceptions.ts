import { AxiosError } from "axios"
import { isAxiosError } from "./typescript_sdk_utils"

export class InvocationError extends Error {
    status_code: number
    cause: any

    public constructor(status_code: number, message: any, error: any) {
        super(message)
        Object.setPrototypeOf(this, InvocationError.prototype)
        this.status_code = status_code
        this.cause = error
        this.name = "invocation_error"
    }

    static fromError(status_code: number, e: SecurityApiError, custom_message?: string): InvocationError
    static fromError(status_code: number, e: AxiosError, custom_message?: string): InvocationError
    static fromError(status_code: number, e: Error, custom_message?: string): InvocationError {
        if (custom_message !== undefined) {
            return new InvocationError(status_code, custom_message, e)
        }
        if (e instanceof SecurityApiError) {
            return new InvocationError(e.status || 500, `Security API Error: ${e.message}`, e)
        }
        if (isAxiosError(e)) {
            return new InvocationError(e.response!.status, "Procedure Handler Error", e.response!.data?.error)
        }
        return new InvocationError(status_code, "Unknown Error", e)
    }

    toResponse() : { [key: string]: any } {
        return {
            error: {
                message: this.message,
                name: this.name,
                status_code: this.status_code,
                cause: this.cause
            }
        }
    }
}

export class SecurityApiError extends Error {
    cause: any
    status?: number

    protected constructor(error: any, message: string, status?: number) {
        super(message)
        Object.setPrototypeOf(this, SecurityApiError.prototype);
        this.status = status
        this.cause = error
        this.name = "security_api_error"
    }

    static fromError(e: Error, message: string): SecurityApiError {
        if (isAxiosError(e)) {
            if (e.response!.data.error) {
                return new SecurityApiError(e.response!.data?.error, message, e.response!.status)
            } else {
                return new SecurityApiError(e.response!.data, message, e.response!.status)
            }
        } else {
            return new SecurityApiError(e.message, message, 500)
        }
    }
}
