import * as fs from "fs"
import { load } from "js-yaml"
import * as path from "path"
import {LoggingVerbosityOptions} from "papiea-backend-utils"
import {TracingConfig} from "jaeger-client"
import Ajv, {DefinedError} from "ajv"
import {ValidationError} from "../errors/validation_error"
import {loggingVerbositySchema, tracingConfigSchema} from "./arg_parser_schemas"

const PAPIEA_CONFIG_PATH = process.env.PAPIEA_CONFIG_PATH ?? path.join(__dirname, "../../papiea-config.yaml")

const ajv = new Ajv()
function toComplex(schema: any): (val: any) => any {
    const validate = ajv.compile(schema)

    return (rawValue) => {
        let value: object = {}
        if (typeof rawValue === "string") {
            try {
                value = JSON.parse(rawValue)
            } catch (e) {
                console.error(`Couldn't JSON parse value: ${rawValue}`)
                throw e
            }
        } else if (typeof rawValue === "object") {
            value = rawValue
        } else {
            throw new ValidationError([new Error(`Complex error should be represented by a string value, found: ${rawValue}`)])

        }
        if (validate(value)) {
            return value
        } else {
            console.error(`Couldn't validate value: ${JSON.stringify(value)}`)
            for (const err of validate.errors as DefinedError[]) {
                console.error(JSON.stringify(err))
            }
            throw new ValidationError(validate.errors as any)
        }
    }
}

const toComplexLoggingVerbosity = toComplex(loggingVerbositySchema)
const toComplexTracingConfig = toComplex(tracingConfigSchema)

function toNum(val: string): number {
    try {
        return Number.parseFloat(val)
    } catch (e) {
        throw new ValidationError([new Error(`Couldn't validate ${val}, expected number`)])
    }
}
const toStr: (val: string) => string = (val: string) => val
const toBool: (val: string) => boolean = (val: string) => {
    return !["0", "null", "false", ""].includes(val);
}

const TRANSFORM_FN_MAP: { [key in keyof PapieaConfig]: (val: any) => PapieaConfig[key] } = {
    server_port: toNum,
    entity_batch_size: toNum,
    deleted_watcher_persist_time: toNum,
    entity_poll_delay: toNum,
    intent_resolve_delay: toNum,
    diff_resolve_delay: toNum,
    diff_retry_exponent: toNum,
    debug: toBool,
    public_addr: toStr,
    mongo_url: toStr,
    mongo_db: toStr,
    admin_key: toStr,
    logging_level: toStr,
    logging_verbosity: toComplexLoggingVerbosity,
    tracing_config: toComplexTracingConfig
}

export interface PapieaConfig {
    [k: string]: any

    // Server port
    server_port: number,

    // Public facing papiea address
    public_addr: string,

    // Mongo url
    mongo_url: string,

    // Mongo Db collection name to store papiea entities in
    mongo_db: string,

    // Papiea Admin S2S key
    admin_key: string,

    // Papiea debug mode toggle
    debug: boolean,

    // Default logging level for papiea
    logging_level: string,

    // Size of batch of random entities to be added to diff resolution each N seconds
    entity_batch_size: number,

    // Deleted watcher persists in database for this amount of seconds
    deleted_watcher_persist_time: number

    // Delay for polling entity changes in database in milliseconds
    entity_poll_delay: number

    // Delay for observing intent watcher status change in milliseconds
    intent_resolve_delay: number

    // Delay for rediffing watcher entities in milliseconds
    diff_resolve_delay: number

    // Exponent value for the diff retry logic backoff calculation
    diff_retry_exponent: number

    // Config options for logging verbosity
    logging_verbosity: LoggingVerbosityOptions,

    tracing_config: TracingConfig
}

const PAPIEA_DEFAULT_CFG: PapieaConfig = {
    server_port: 3000,
    public_addr: "http://localhost:3000",
    mongo_url: "mongodb://mongo:27017",
    mongo_db: "papiea",
    admin_key: "",
    debug: true,
    logging_level: "info",
    entity_batch_size: 5,
    deleted_watcher_persist_time: 100,
    entity_poll_delay: 250,
    intent_resolve_delay: 3000,
    diff_resolve_delay: 1500,
    diff_retry_exponent: 1.3,
    logging_verbosity: {
        verbose: false,
        fields: []
    },
    tracing_config: {
        reporter: {
            collectorEndpoint: "http://jaeger:14268/api/traces",
            agentHost: "jaeger",
            agentPort: 6832,
            logSpans: true
        },
        sampler: {
            type: "const",
            param: 1
        }
    }
}

export function getConfig(): PapieaConfig {
    const config: PapieaConfig = load(fs.readFileSync(PAPIEA_CONFIG_PATH, 'utf-8'))
    const mapConfigToEnv: { [key in keyof PapieaConfig]: string } = {} as any
    Object.assign(mapConfigToEnv, PAPIEA_DEFAULT_CFG)
    for (let key in mapConfigToEnv) {
        mapConfigToEnv[key] = `PAPIEA_${key.toUpperCase()}`
    }
    // If there is an env variable prefixed with PAPIEA_ and has the same name
    // as the config parameter - override config param with an env variable
    for (let key in PAPIEA_DEFAULT_CFG) {
        if (PAPIEA_DEFAULT_CFG.hasOwnProperty(key) && !config.hasOwnProperty(key)) {
            config[key] = PAPIEA_DEFAULT_CFG[key]
        } else {
            const transformFn = TRANSFORM_FN_MAP[key]
            config[key] = transformFn(config[key])
        }
        if (process.env[mapConfigToEnv[key]] !== undefined) {
            const transformFn = TRANSFORM_FN_MAP[key]
            if (transformFn !== undefined) {
                config[key] = transformFn(process.env[mapConfigToEnv[key]]!)
            } else {
                config[key] = process.env[mapConfigToEnv[key]]!
            }
        }
    }
    return config
}
