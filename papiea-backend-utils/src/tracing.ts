import {FORMAT_HTTP_HEADERS, Span, Tracer} from "opentracing"
import {initTracer, ReporterConfig, SamplerConfig} from "jaeger-client"
import {NextFunction, Request, Response} from "express"
import {Logger} from "./logging"
import {IncomingHttpHeaders} from "http"
import {Entity} from "papiea-core"

const defaultReporter = {
    collectorEndpoint: "http://jaeger:14268/api/traces",
    agentHost: "jaeger",
    agentPort: 6832,
    logSpans: true
};

const defaultSampler = {
    type: "const",
    param: 1
};

export interface TracingCtx {
    headers: IncomingHttpHeaders,
    parentSpan?: Span,
    tracer: Tracer
}

const defaultLogger = {
    info: (msg: string) => {
        console.log("JAEGER INFO ", msg);
    },
    error: (msg: string) => {
        console.log("JAEGER ERROR", msg);
    }
};

const suppressedLogger = {
    info: (msg: string) => {
    },
    error: (msg: string) => {
        console.log("JAEGER ERROR", msg);
    }
}

export function getTracer(serviceName: string, logger?: Logger, reporterConfig?: ReporterConfig, samplerConfig?: SamplerConfig, logJaegerMessages: boolean = false): Tracer {
    const tracerLogger = logJaegerMessages ? (logger ?? defaultLogger) : suppressedLogger
    const config = {
        serviceName: serviceName,
        reporter: reporterConfig ?? defaultReporter,
        sampler: samplerConfig ?? defaultSampler
    }
    return initTracer(config, {logger: tracerLogger})
}

export function getTracingMiddleware(tracer: Tracer) {
    return function (operationName: string) {
        return function (req: Request, res: Response, next: NextFunction) {
            let { headers, path, url, method, body, query, params } = req;
            const context = tracer.extract(FORMAT_HTTP_HEADERS, headers)

            const span = tracer.startSpan(operationName, { childOf: context! });
            span.setTag("http.request.url", url);
            span.setTag("http.request.method", method);
            span.setTag("http.request.path", path);
            span.log({headers}).log({ body }).log({ query }).log({ params });

            tracer.inject(span, FORMAT_HTTP_HEADERS, headers);
            res.locals.ctx = {
                tracing_ctx: {tracer: tracer, parentSpan: span, headers: headers}
            }
            req.headers = headers;
            res.once("finish", () => {
                span.setTag("http.response.status_code", res.statusCode);
                span.setTag("http.response.status_message", res.statusMessage);
                span.finish();
            });

            return next();
        }
    }
}

export function getTraceHeaders(headers: any) {
    const traceId = headers["uber-trace-id"]
    if (traceId) {
        return {"uber-trace-id": traceId}
    }
}

export function spanOperation(operationName: string, ctx: TracingCtx, tags?: {[key: string]: any}): Span {
    let span: Span
    const {headers, parentSpan, tracer} = ctx
    if (parentSpan !== undefined && parentSpan !== null) {
        span = tracer.startSpan(operationName, { childOf: parentSpan })
    } else {
        span = tracer.startSpan(operationName)
    }
    if (tags) {
        for (let prop in tags) {
            span.setTag(prop, tags[prop])
        }
    }
    ctx.tracer.inject(span, FORMAT_HTTP_HEADERS, headers)
    return span
}

export function spanEntityOperation(operationName: string, ctx: TracingCtx, entity: Partial<Entity>, tags?: {[key: string]: any}): Span {
    return spanOperation(operationName, ctx, {
        "entity_uuid": entity.metadata?.uuid,
        ...tags
    })
}
