import { LoggerFactory } from "papiea-backend-utils";

const logger_factory = new LoggerFactory({logPath: "e2e_tests"})
export const [logger, _] = logger_factory.createLogger({level: "debug"})

export function get_kind_ref_type(kind: string, description: string = "") {
    return {
        type: "object",
        description: description,
        required: ["uuid", "kind"],
        properties: {
            uuid: {
                type: "string"
            },
            kind: {
                type: "string",
                example: kind || "kind_name"
            }
        }
    }
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}