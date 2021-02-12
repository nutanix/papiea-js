import {JSONSchemaType} from "ajv"
import {LoggingVerbosityOptions} from "papiea-backend-utils"
import {TracingConfig} from "jaeger-client"

export const loggingVerbositySchema: JSONSchemaType<LoggingVerbosityOptions> = {
    type: "object",
    properties: {
        verbose: {type: "boolean"},
        fields: {type: "array", items: {"type": "string"}}
    },
    required: ["verbose"],
    additionalProperties: false,
}

export const tracingConfigSchema: JSONSchemaType<TracingConfig> = {
    type: "object",
    properties: {
        serviceName: {type: "string", nullable: true},
        disable: {type: "boolean", nullable: true},
        sampler: {
            type: "object", nullable: true,
            properties: {
                type: {type: "string"},
                param: {type: "integer"},
                hostPort: {type: "string", nullable: true},
                host: {type: "string", nullable: true},
                port: {type: "integer", nullable: true},
                refreshIntervalMs: {type: "number", nullable: true}
            },
            required: []
        },
        reporter: {
            type: "object", nullable: true,
            properties: {
                logSpans: {type: "boolean", nullable: true},
                agentPort: {type: "integer", nullable: true},
                agentHost: {type: "string", nullable: true},
                flushIntervalMs: {type: "number", nullable: true},
                collectorEndpoint: {type: "string", nullable: true},
                username: {type: "string", nullable: true},
                password: {type: "string", nullable: true}
            },
            required: [],

        },
        traceId128bit: {type: "boolean", nullable: true},
        shareRpcSpan: {type: "boolean", nullable: true},
    },
    required: [],
    additionalProperties: false
}
