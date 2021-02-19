import {
    LOG_LEVELS, LogLevel, logLevelFromString, LoggerOptions, Logger,
    LoggerFactory, LoggerHandle, LoggingVerbosityOptions
} from './logging';

import {dotnotation} from './dotnotation'
import {getTracer, getTracingMiddleware, TracingCtx, spanOperation, spanEntityOperation, getTraceHeaders} from "./tracing"

interface RequestContext {
    tracing_ctx: TracingCtx
}

export {
    LOG_LEVELS, LogLevel, logLevelFromString, LoggerOptions, Logger,
    LoggerFactory, dotnotation, LoggerHandle, LoggingVerbosityOptions,
    getTracer, getTracingMiddleware, spanOperation, spanEntityOperation,
    RequestContext, getTraceHeaders
};