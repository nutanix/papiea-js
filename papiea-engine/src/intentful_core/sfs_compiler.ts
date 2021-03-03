import { ValidationError } from "../errors/validation_error"
import {DiffContent, Spec, Status} from "papiea-core"
import { PapieaException } from "../errors/papiea_exception";
import { Logger } from "papiea-backend-utils";

// TODO: add d.ts for type annotations
const papi_clj = require("../../papiea-lib-clj/papiea-lib-clj.js").papiea_lib_clj;
const clj_str = (a: any) => papi_clj.core.clj_str(a);
const sfs_parser = (sfs_ast: string) => papi_clj.core.parse_sfs(sfs_ast);
const sfs_optimizer = (sfs_ast: string) => papi_clj.core.optimize_sfs_ast(sfs_ast);
const sfs_compiler = (sfs_signature: string) => papi_clj.core.compile_sfs(sfs_signature);
const run_compiled_sfs = (compiled_sfs: any, spec: any, status: any) =>
    papi_clj.core.run_compiled_sfs(compiled_sfs, spec, status);

// Removes all the status-only fields from the entity status using the schema
function remove_status_only_fields(schema: any, status: Status): Status {
    if (schema) {
        // Return null for fields that are status-only
        if (schema.hasOwnProperty('x-papiea') && schema['x-papiea'] === 'status-only') {
            return null
        }
        if (schema.type === 'object' && status && Object.keys(status).length !== 0) {
            const properties = schema['properties']
            for (let name in properties) {
                status[name] = remove_status_only_fields(properties[name], status[name])
                // If received null i.e. a status-only field, delete the field from status object
                if (status[name] === null) {
                    delete status[name]
                }
            }
        } else if (schema.type === 'array' && status && status.length !== 0) {
            let i = 0;
            // Loop through all values in array and inspect status-only for each
            for (let item of status) {
                status[i] = remove_status_only_fields(schema['items'], item)
                i++
            }
            // If the array element has all status-only fields, it would be set to empty object
            // based on the above logic, so remove the element from array to avoid empty values.
            status = status.filter((item: any) => Object.keys(item).length !== 0);
        }
    }
    return status
}

// Removes all the null and undefined fields from the entity
function remove_undefined_or_null_values(entity: any, logger?: Logger, kind_name: string = '', entity_name: string = '', field_name: string = ''): any {
    const newObj: any = {};
    Object.entries(entity).forEach(([k, v]) => {
        if (Array.isArray(v)) {
            newObj[k] = []
            v.forEach(v_item => {
                newObj[k].push(remove_undefined_or_null_values(v_item, logger, kind_name, entity_name, field_name + "/" + k))
            });
        } else if (v === Object(v)) {
            newObj[k] = remove_undefined_or_null_values(v, logger, kind_name, entity_name, field_name + "/" + k);
        } else if (v != null && v !== undefined) {
            newObj[k] = entity[k];
        } else {
            if (logger !== undefined) {
                logger.debug(`Removing undefined/null field: ${field_name}/${k} from the entity ${entity_name} for kind ${kind_name}.`);
            } else {
                console.debug(`Removing undefined/null field: ${field_name}/${k} from the entity ${entity_name} for kind ${kind_name}.`)
            }
        }
    });
    return newObj;
}

function cleanup_spec_for_sfs_run(spec: Spec, kind_name: string, logger?: Logger): Spec {
    const diff_spec = remove_undefined_or_null_values(spec, logger, kind_name, "spec")
    return diff_spec
}

function cleanup_status_for_sfs_run(status: Status, schema: any, kind_name: string, logger?: Logger): Status {
    let diff_status = remove_undefined_or_null_values(status, logger, kind_name, "status")
    diff_status = remove_status_only_fields(schema, diff_status)
    return diff_status
}

export class SFSCompiler {
    static try_parse_sfs(sfs: string, provider_prefix: string, provider_version: string,kind_name: string): void {
        try {
            sfs_parser(sfs)
        } catch(e) {
            throw new ValidationError([
                new PapieaException(`SFS parsing on kind ${provider_prefix}/${provider_version}/${kind_name} failed with error: ${e.message}`, { provider_prefix: provider_prefix, provider_version: provider_version, kind_name: kind_name, additional_info: { "sfs": sfs }})
            ])
        }
    }

    static try_compile_sfs(sfs: string, kind: string, provider_prefix: string = '', provider_version: string = ''): any {
        this.try_parse_sfs(sfs, provider_prefix, provider_version, kind)
        return sfs_compiler(sfs)
    }

    static run_sfs(compiled_sfs: any, spec: any, status: any, schema: any, kind_name: string, logger?: Logger): DiffContent[] | null {
        const diff_spec = cleanup_spec_for_sfs_run(spec, kind_name, logger)
        const diff_status = cleanup_status_for_sfs_run(status, schema, kind_name, logger)
        return run_compiled_sfs(compiled_sfs, diff_spec, diff_status)
    }
}
