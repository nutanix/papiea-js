import { ValidationError } from "../errors/validation_error";
import { isEmpty } from "../utils/utils"
import {
    Data_Description,
    Entity_Reference,
    FieldBehavior,
    IntentfulBehaviour,
    Kind,
    Metadata,
    Provider,
    Spec,
    Status
} from "papiea-core"
import { SFSCompiler } from "../intentful_core/sfs_compiler"
import * as uuid_validate from "uuid-validate"
import { load } from "js-yaml"
import { readFileSync } from "fs"
import { resolve } from "path"

// We can receive model in 2 forms:
// As user specified in definition, which means it has "properties" field ( { properties: {} } } )
// As procedure returned, which means it is an empty object ( {} )
function modelIsEmpty(model: any) {
    if (isEmpty(model)) {
        return true
    }
    if (model && model.properties !== undefined && model.properties !== null) {
        return isEmpty(model.properties)
    }
    return false
}

function modelIsNullable(model: any) {
    if (model && (model.required === undefined || model.required === null)) {
        return true
    }
}

const SwaggerModelValidator = require('swagger-model-validator');

export interface Validator {
    validate_uuid(kind: Kind, uuid: string): void
    validate_metadata_extension(extension_structure: Data_Description, metadata: Metadata | undefined, allowExtraProps: boolean): void
    validate_spec(spec: Spec, kind: Kind, allowExtraProps: boolean): void
    validate_sfs(provider: Provider): void
    validate_status(provider: Provider, entity_ref: Entity_Reference, status: Status): void
    validate_provider(provider: Provider): void
    validate(data: any, model: any | undefined, models: any, allowExtraProps: boolean, schemaName: string, procedureName?: string): void
}

export class ValidatorImpl {
    private validator = new SwaggerModelValidator();

    protected constructor(private procedural_signature_schema: Data_Description, private provider_schema: Data_Description) {
    }

    public static create() {
        const procedural_signature_schema = loadSchema("./schemas/procedural_signature.yaml")
        const provider_schema = loadSchema("./schemas/provider_schema.yaml")
        return new ValidatorImpl(procedural_signature_schema, provider_schema)
    }

    public validate_uuid(kind: Kind, uuid: string) {
        const validation_pattern = kind.uuid_validation_pattern
        if (validation_pattern === undefined) {
            if (!uuid_validate(uuid)) {
                throw new Error("uuid is not valid")
            }
        } else {
            const regex = new RegExp(validation_pattern, 'g')
            if (!regex.test(uuid)) {
                throw new Error("uuid is not valid")
            }
        }
    }

    public validate_metadata_extension(extension_structure: Data_Description, metadata: Metadata | undefined, allowExtraProps: boolean) {
        if (metadata === undefined) {
            return
        }
        if (extension_structure === undefined || extension_structure === null || isEmpty(extension_structure)) {
            return
        }
        if (metadata.extension !== undefined && metadata.extension !== null && typeof metadata.extension !== "object") {
            throw new ValidationError([{"name": "Error", message: "Metadata extension should be an object"}])
        }
        if (metadata.extension === undefined || metadata.extension === null || isEmpty(metadata.extension)) {
            throw new ValidationError([{"name": "Error", message: "Metadata extension is not specified"}])
        }
        const schemas: any = Object.assign({}, extension_structure);
        this.validate(metadata.extension, Object.values(extension_structure)[0], schemas,
            allowExtraProps, Object.keys(extension_structure)[0]);
    }

    public validate_spec(spec: Spec, kind: Kind, allowExtraProps: boolean) {
        const schemas: any = Object.assign({}, kind.kind_structure);
        // remove any status-only field from the schema to pass to validator
        this.remove_schema_fields(schemas, "status-only")
        this.validate(spec, Object.values(kind.kind_structure)[0], schemas,
            allowExtraProps, Object.keys(kind.kind_structure)[0]);
    }

   /**
     * Recursively removes a field from properties if it has to be shown only for the opposite type.
     * @param schema - schema to remove the fields from.
     * @param fieldName - type of x-papiea value spec-only|status-only.
     */
    remove_schema_fields(schema: any, fieldName: string) {
        for (let prop in schema) {
            if (typeof schema[prop] === 'object' && "x-papiea" in schema[prop] && schema[prop]["x-papiea"] === fieldName) {
                delete schema[prop]
            } else if (typeof schema[prop] === 'object')
                this.remove_schema_fields(schema[prop], fieldName)
        }
    }

    public async validate_status(provider: Provider, entity_ref: Entity_Reference, status: Status) {
        if (status === undefined || isEmpty(status)) {
            throw new ValidationError([new Error(`Status body is undefined, please use null fields instead`)])
        }
        const kind = provider.kinds.find((kind: Kind) => kind.name === entity_ref.kind);
        const allowExtraProps = provider.allowExtraProps;
        if (kind === undefined) {
            throw new Error("Kind not found");
        }
        const schemas: any = Object.assign({}, kind.kind_structure);
        this.validate(status, Object.values(kind.kind_structure)[0], schemas,
            allowExtraProps, Object.keys(kind.kind_structure)[0]);
    }

    public validate_sfs(provider: Provider) {
        for (let kind of provider.kinds) {
            if (kind.intentful_behaviour === IntentfulBehaviour.Differ) {
                // Throws an exception if it fails
                kind.intentful_signatures.forEach(sig => SFSCompiler.try_parse_sfs(sig.signature, kind.name))
            }
        }
    }

    public validate_provider(provider: Provider) {
        const schemas = {}
        Object.assign(schemas, this.provider_schema)
        Object.assign(schemas, this.procedural_signature_schema)
        this.validate(
            provider, Object.values(this.provider_schema)[0],
            schemas, true, Object.keys(this.provider_schema)[0], undefined, true)
        Object.values(provider.procedures).forEach(proc => {
            this.validate(
                proc, Object.values(this.procedural_signature_schema)[0],
                schemas, true, proc.name,
                undefined, true)
        })
        provider.kinds.forEach(kind => {
            Object.values(kind.kind_procedures).forEach(proc => {
                this.validate(
                    proc, Object.values(this.procedural_signature_schema)[0],
                    schemas, true, proc.name,
                    undefined, true)
            })
            Object.values(kind.entity_procedures).forEach(proc => {
                this.validate(
                    proc, Object.values(this.procedural_signature_schema)[0],
                    schemas, true, proc.name,
                    undefined, true)
            })
            Object.values(kind.intentful_signatures).forEach(proc => {
                this.validate(
                    proc, Object.values(this.procedural_signature_schema)[0],
                    schemas, true, proc.name,
                    undefined, true)
            })
            Object.values(kind.kind_structure).forEach(structure => {
                this.validate_kind_structure(structure)
            })
        })
    }

    validate_kind_structure(schema: Data_Description) {
        const x_papiea_field = "x-papiea"
        const status_only_value = FieldBehavior.StatusOnly
        // x_papiea_field property have only status_only_value value
        this.validate_field_value(schema, x_papiea_field, [status_only_value])
        this.validate_spec_only_structure(schema)
        // status-only fields cannot be required in schema
        this.validate_status_only_field({"schema": schema})
    }

    validate_field_value(schema: Data_Description, field_name: string, possible_values: string[]) {
        for (let prop in schema) {
            if (typeof schema[prop] === "object") {
                if (field_name in schema[prop]) {
                    const value = schema[prop][field_name]
                    if (!possible_values.includes(value)) {
                        let message = `${field_name} has wrong value: ${value}, `
                        if (possible_values.length > 0) {
                            message += `possible values are: ${possible_values.toString()}`
                        } else {
                            message += "the field should not be present"
                        }
                        throw new ValidationError([{
                            name: "Error",
                            message: message
                        }])
                    }
                } else {
                    this.validate_field_value(schema[prop], field_name, possible_values)
                }

            }
        }
    }

    validate_spec_only_structure(entity: Data_Description) {
        const spec_only_value = "spec-only"
        const x_papiea_entity_field = "x-papiea-entity"
        const x_papiea_field = "x-papiea"
        if (typeof entity === "object" && entity.hasOwnProperty(x_papiea_entity_field) && entity[x_papiea_entity_field] === spec_only_value) {
            // spec-only entity can't have x_papiea_field values
            this.validate_field_value(entity.properties, x_papiea_field, [])
        }
    }

    validate_status_only_field(schema: Data_Description) {
        try {
            for(let field in schema) {
                const field_schema = schema[field]
                if (field_schema.hasOwnProperty("type")) {
                    if (field_schema["type"] === "object") {
                        if (field_schema.hasOwnProperty("required") && field_schema.hasOwnProperty("properties")) {
                            for (let req_field of field_schema["required"]) {
                                if (field_schema["properties"][req_field].hasOwnProperty("x-papiea") && field_schema["properties"][req_field]["x-papiea"] === "status-only") {
                                    throw new ValidationError([{
                                        name: "ValidationError",
                                        message: `${req_field} of type 'status-only' is set to be required. Required fields cannot be 'status-only'`
                                    }])
                                }
                            }
                        }
                        this.validate_status_only_field(field_schema["properties"])
                    }
                    if (field_schema["type"] === "array") {
                        if (field_schema.hasOwnProperty("items") && field_schema["items"].hasOwnProperty("type")) {
                            if (field_schema["items"]["type"].includes("object") && field_schema["items"].hasOwnProperty("required") && field_schema["items"].hasOwnProperty("properties")) {
                                for (let req_field of field_schema["items"]["required"]) {
                                    if (field_schema["items"]["properties"][req_field].hasOwnProperty("x-papiea") && field_schema["items"]["properties"][req_field]["x-papiea"] === "status-only") {
                                        throw new ValidationError([{
                                            name: "ValidationError",
                                            message: `${req_field} of type 'status-only' is set to be required. Required fields cannot be 'status-only'`
                                        }])
                                    }
                                }
                                this.validate_status_only_field(field_schema["items"]["properties"])
                            }
                        }
                    }
                }
            }
        } catch (e) {
            throw (e)
        }
    }

    public validate(
        data: any, model: any | undefined, models: any,
        allowExtraProps: boolean, schemaName: string,
        procedureName?: string, allowBlankTarget: boolean = false) {
        const validatorDenyExtraProps = !allowExtraProps
        if (modelIsEmpty(model)) {
            if (isEmpty(data)) {
                return {valid: true}
            } else {
                throw new ValidationError([{
                    name: "Error",
                    message: procedureName !== undefined
                        ? `${procedureName} with schema ${schemaName} was expecting empty object`
                        : `${schemaName} was expecting empty object`
                }])
            }
        }
        if (model !== undefined && model !== null) {
            if (data === null || isEmpty(data)) {
                if (modelIsNullable(model)) {
                    // Model has fields but none of those are required
                    return {valid: true}
                } else {
                    // Model has required fields expecting non-empty input
                    throw new ValidationError([{
                        name: "Error",
                        message: procedureName !== undefined
                            ? `${procedureName} with schema ${schemaName} was expecting non-empty input`
                            : `${schemaName} was expecting non-empty input`
                    }])
                }
            }

            const res = this.validator.validate(data, model, models, allowBlankTarget, validatorDenyExtraProps);
            if (!res.valid) {
                throw new ValidationError(res.errors);
            }
            return res
        } else {
            if (data !== undefined && data !== null && data !== "" && !(Object.entries(data).length === 0 && data.constructor === Object)) {
                throw new ValidationError([{
                    name: "Error",
                    message: procedureName !== undefined
                        ? `${procedureName} with schema ${schemaName} was expecting type void`
                        : `${schemaName} was expecting type void`
                }])
            }
        }
    }
}

function loadSchema(schemaPath: string): any {
    return load(readFileSync(resolve(__dirname, schemaPath), "utf-8"));
}
