import {Entity, ErrorSchemas, Provider} from "papiea-core"
import {Request} from "express"
import {FORMAT_HTTP_HEADERS, Span, Tracer} from "opentracing"
import {ProceduralCtx_Interface} from "./typescript_sdk_interface"

export function validate_error_codes(error_desc: ErrorSchemas | undefined) {
    if (error_desc) {
        for (let code of Object.keys(error_desc)) {
            const parsed_code = Number(code)
            if (!Number.isInteger(parsed_code) || !(parsed_code >= 400 && parsed_code <= 599)) {
                throw new Error(`Error description should feature status code in 4xx or 5xx, received: ${parsed_code}`)
            }
        }
    }
}

export function get_papiea_version(): string {
    const packageJSON = require('../../package.json');
    const sdk_version: string = packageJSON.version.split('+')[0];
    return sdk_version;
}

export function spanSdkOperation(operationName: string, tracer: Tracer, req: Request, provider: Provider, tags?: {[key: string]: any}) {
    let { headers } = req;
    const context = tracer.extract(FORMAT_HTTP_HEADERS, headers)
    if (isConstructor(operationName)) {
        operationName = `${provider.prefix}'s (version: ${provider.version}) constructor, kind: ${tags?.kind}`
    }
    if (isDestructor(operationName)) {
        `${provider.prefix}'s (version: ${provider.version}) destructor, kind: ${tags?.kind}`
    }
    const span = tracer.startSpan(operationName, { childOf: context! });
    if (tags) {
        for (let prop in tags) {
            span.setTag(prop, tags[prop])
        }
    }
    span.setTag("provider_prefix", `${provider.prefix}`)
    span.setTag("provider_version", `${provider.version}`)
    return span
}

const isConstructor = isSpecialProcedure("/^__.*_create$/")

const isDestructor = isSpecialProcedure("/^__.*_delete$/")

function isSpecialProcedure(pattern: string) {
    return (operationName: string): boolean => {
        const regexp = RegExp(pattern)
        return regexp.test(operationName)
    }
}
