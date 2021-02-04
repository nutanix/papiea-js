import {Request, RequestHandler} from "express"
import {IncomingHttpHeaders} from "http"

import {Logger} from "papiea-backend-utils"

import {UserAuthInfo, UserAuthInfoRequest} from "./auth/authn"
import {safeJSONParse} from "./utils/utils"
import {Span} from "opentracing"

export interface AuditLogMessage {
    method: string,
    url: string,
    status_code: number,
    headers?: IncomingHttpHeaders,
    request_ip?: string,
    response_body?: any,
    request_body?: any,
    user?: UserAuthInfo,
    trace_id?: string
}

export class AuditLogger {
    private readonly _logger: Logger
    private readonly _debug: boolean

    constructor(logger: Logger, debug?: boolean) {
        this._logger = logger
        this._debug = debug ?? false
    }

    middleware(): RequestHandler {
        return (req, res, next) => {
            const end = res.end;
            let body: any;
            res.end = (chunk: any, encoding?: any, cb?: any): void => {
                res.end = end
                res.end(chunk, encoding, cb)
                if (chunk) {
                    const stringChunk = chunk && chunk.toString()
                    body = (safeJSONParse(chunk) || stringChunk)
                }
            }
            res.on("finish", () => {
                (<any>res).body = body
                this.log(req, res)
            })
            next()
        }
    }

    log(req: Request, res: any) {
        const logmsg: AuditLogMessage = {
            request_ip: req.ip,
            method: req.method,
            url: req.originalUrl,
            status_code: res.statusCode,
        }
        if (res.locals.ctx && res.locals.ctx.tracing_ctx) {
            const span: Span = res.locals.ctx.tracing_ctx.parentSpan
            logmsg.trace_id = span.context().toTraceId()
        }
        const verbose = this._logger.opts().verbosity_options.verbose
        const fields = this._logger.opts().verbosity_options.fields
        if (verbose || fields.includes("headers")) {
            logmsg.headers = req.headers
        }
        if (verbose || (fields.includes("request_body") && req.body)) {
            logmsg.request_body = req.body
        }
        if (verbose || (fields.includes("response_body") && res.body)) {
            logmsg.response_body = res.body
        }
        if ((req as UserAuthInfoRequest).user) {
            logmsg.user = (req as UserAuthInfoRequest).user
        }
        this._logger.audit(logmsg)
    }
}
