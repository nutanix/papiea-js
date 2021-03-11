import { ValidationError } from "../errors/validation_error";
import { isEmpty } from "../utils/utils"
import {
    Data_Description,
    Entity_Reference,
    FieldBehavior,
    IntentfulBehaviour,
    Kind,
    Metadata, Procedural_Signature,
    Provider,
    Spec,
    Status,
    SwaggerModelValidatorErrorMessage
} from "papiea-core"
import { SFSCompiler } from "../intentful_core/sfs_compiler"
import * as uuid_validate from "uuid-validate"
import { load } from "js-yaml"
import { readFileSync } from "fs"
import { resolve } from "path"
import { cloneDeep } from "lodash"
import { PapieaException } from "../errors/papiea_exception"
import uuid = require("uuid");
import { Logger, LoggerFactory } from "papiea-backend-utils";

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

function convertValidatorMessagesToPapieaMessages(
    provider_prefix: string, provider_version: string, kind_name: string,
    errors: Error[], data: any, model: any) {
    let fieldName: string
    let message: string
    for (let i = 0;i < errors.length;i++) {
        message = errors[i].message
        if (message.includes(SwaggerModelValidatorErrorMessage.undefined_value_str)) {
            fieldName = message.replace(SwaggerModelValidatorErrorMessage.undefined_value_str, "");
            if (fieldName === 'rootModel') {
                message = `Received procedure input is null/undefined, provide input value for kind ${provider_prefix}/${provider_version}/${kind_name}`
            } else {
                message = `Received procedure input has null/undefined value for field: ${fieldName}, provide field value for kind ${provider_prefix}/${provider_version}/${kind_name}`
            }
        } else if (message.includes(SwaggerModelValidatorErrorMessage.empty_value_str)) {
            fieldName = message.replace(SwaggerModelValidatorErrorMessage.empty_value_str, "");
            if (fieldName === 'rootModel') {
                message = `Received procedure input value is empty, required non-empty input value for kind ${provider_prefix}/${provider_version}/${kind_name}`
            } else {
                message = `Received procedure input has empty value for field: ${fieldName}, required non-empty value for kind ${provider_prefix}/${provider_version}/${kind_name}`
            }
        } else if (message.includes(SwaggerModelValidatorErrorMessage.undefined_model_str)) {
            message = `Schema for the input is null/undefined, required valid schema for kind ${provider_prefix}/${provider_version}/${kind_name}`
        } else if (message.includes(SwaggerModelValidatorErrorMessage.type_mismatch_str)) {
            message = message.replace(SwaggerModelValidatorErrorMessage.type_mismatch_str, "")
            const inputType = message.slice(0, message.indexOf(','))
            const targetType = message.replace(inputType + ", expected: ", "")
            message = `Received procedure input field has type: ${inputType}, schema expected type: ${targetType} for kind ${provider_prefix}/${provider_version}/${kind_name}\nInput:\n${JSON.stringify(data)}\nSchema:\n${JSON.stringify(model)}`
        } else if (message.includes(SwaggerModelValidatorErrorMessage.additional_input_field_str)) {
            message = message.replace(SwaggerModelValidatorErrorMessage.additional_input_field_str, "");
            fieldName = message.replace("' is not in the model", "")
            message = `Received procedure input has additional field: '${fieldName}' not present in the schema for kind ${provider_prefix}/${provider_version}/${kind_name}\nInput:\n${JSON.stringify(data)}\nSchema:\n${JSON.stringify(model)}`
        } else if (message.includes(SwaggerModelValidatorErrorMessage.non_string_type_field_str)) {
            message = message.replace(SwaggerModelValidatorErrorMessage.non_string_type_field_str, "")
            fieldName = message.replace(") has a non string 'type' field", "")
            message = `Schema field: ${fieldName} has type set to a non-string value for kind ${provider_prefix}/${provider_version}/${kind_name}\nSchema:\n${JSON.stringify(model)}`
        } else if (message.includes(SwaggerModelValidatorErrorMessage.not_object_type_str)) {
            fieldName = message.slice(0, message.indexOf(SwaggerModelValidatorErrorMessage.not_object_type_str))
            const fieldType = message.replace(fieldName + SwaggerModelValidatorErrorMessage.not_object_type_str, "")
            message = `Received procedure input field: ${fieldName} has type: ${fieldType}, schema expected type object for kind ${provider_prefix}/${provider_version}/${kind_name}\nInput:\n${JSON.stringify(data)}\nSchema:\n${JSON.stringify(model)}`
        } else if (message.includes(SwaggerModelValidatorErrorMessage.not_array_type_str)) {
            fieldName = message.slice(0, message.indexOf(SwaggerModelValidatorErrorMessage.not_array_type_str))
            message = `Schema expected input field: ${fieldName} to be an array for kind ${provider_prefix}/${provider_version}/${kind_name}\nInput:\n${JSON.stringify(data)}\nSchema:\n${JSON.stringify(model)}`
        } else if (message.includes(SwaggerModelValidatorErrorMessage.required_field_no_value_str)) {
            fieldName = message.slice(0, message.indexOf(SwaggerModelValidatorErrorMessage.required_field_no_value_str))
            message = `Received procedure input is missing required field: ${fieldName} for kind ${provider_prefix}/${provider_version}/${kind_name}\nInput:\n${JSON.stringify(data)}\nSchema:\n${JSON.stringify(model)}`
        } else if (message.includes(SwaggerModelValidatorErrorMessage.required_field_missing_schema_str)) {
            fieldName = message.replace(SwaggerModelValidatorErrorMessage.required_field_missing_schema_str, "")
            message = `Missing/invalid schema definition for required field: ${fieldName} for kind ${provider_prefix}/${provider_version}/${kind_name}\nInput:\n${JSON.stringify(data)}\nSchema:\n${JSON.stringify(model)}`
        }
        errors[i].message = message
    }
}

const SwaggerModelValidator = require('swagger-model-validator');

export interface Validator {
    validate_uuid(kind: Kind, uuid: string): void
    validate_metadata_extension(extension_structure: Data_Description, metadata: Metadata | undefined, allowExtraProps: boolean): void
    validate_spec(provider: Provider, spec: Spec, kind: Kind, allowExtraProps: boolean): void
    validate_sfs(provider: Provider): void
    validate_status(provider: Provider, entity_ref: Entity_Reference, status: Status): void
    validate_provider(provider: Provider): void
    validate(provider_prefix: string, provider_version: string, kind_name: string, data: any, model: any | undefined, models: any, allowExtraProps: boolean, schemaName: string, procedureName?: string): void
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
                throw new PapieaException(`Invalid entity UUID`, { kind_name: kind.name, additional_info: { "entity_uuid": uuid }})
            }
        } else {
            const regex = new RegExp(validation_pattern, 'g')
            if (!regex.test(uuid)) {
                throw new PapieaException(`Entity UUID does not match the pattern`, { kind_name: kind.name, additional_info: { "entity_uuid": uuid, "uuid_validation_pattern": validation_pattern }})
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
            throw new ValidationError([{"name": "Error", message: `Metadata extension should be an object for entity of kind ${metadata.provider_prefix}/${metadata.provider_version}/${metadata.kind}`}], { provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": uuid.toString(), "metadata_extension": JSON.stringify(metadata.extension) }})
        }
        if (metadata.extension === undefined || metadata.extension === null || isEmpty(metadata.extension)) {
            throw new ValidationError([{"name": "Error", message: `Metadata extension is not specified for entity of kind ${metadata.provider_prefix}/${metadata.provider_version}/${metadata.kind}`}], { provider_prefix: metadata.provider_prefix, provider_version: metadata.provider_version, kind_name: metadata.kind, additional_info: { "entity_uuid": metadata.uuid } })
        }
        const schemas: any = Object.assign({}, extension_structure);
        this.validate(metadata.provider_prefix, metadata.provider_version, metadata.kind, metadata.extension, Object.values(extension_structure)[0], schemas,
            allowExtraProps, Object.keys(extension_structure)[0], this.validate_metadata_extension.name);
    }

    public validate_spec(provider: Provider, spec: Spec, kind: Kind, allowExtraProps: boolean) {
        const schemas: any = cloneDeep(kind.kind_structure)
        // remove any status-only field from the schema to pass to validator
        this.remove_schema_fields(schemas, "status-only")
        this.validate(provider.prefix, provider.version, kind.name, spec, Object.values(schemas)[0], schemas,
            allowExtraProps, Object.keys(schemas)[0], this.validate_spec.name);
    }

   /**
     * Recursively removes a field from properties if it has to be shown only for the opposite type.
     * @param schema - schema to remove the fields from.
     * @param fieldName - type of x-papiea value spec-only|status-only.
     */
   remove_schema_fields(schema: any, fieldName: string) {
       for (let prop in schema) {
           if (typeof schema[prop] === "object" && "x-papiea" in schema[prop] && schema[prop]["x-papiea"] === fieldName) {
               delete schema[prop]
           } else if (typeof schema[prop] === "object") {
               this.remove_schema_fields(schema[prop], fieldName)
           }
       }
   }

    public async validate_status(provider: Provider, entity_ref: Entity_Reference, status: Status) {
        if (status === undefined || isEmpty(status)) {
            throw new ValidationError([new Error(`Status body has undefined value for one/more fields which is not supported in papiea, use null value instead to remove the field from status for kind ${provider.prefix}/${provider.version}/${entity_ref.kind}`)], { provider_prefix: provider.prefix, provider_version: provider.version, kind_name: entity_ref.kind, additional_info: { "entity_uuid": entity_ref.uuid }})
        }
        const kind = provider.kinds.find((kind: Kind) => kind.name === entity_ref.kind);
        const allowExtraProps = provider.allowExtraProps;
        if (kind === undefined) {
            throw new PapieaException(`Unable to find kind ${provider.prefix}/${provider.version}/${entity_ref.kind} in provider`, { provider_prefix: provider.prefix, provider_version: provider.version, kind_name: entity_ref.kind, additional_info: { "entity_uuid": entity_ref.uuid }});
        }
        const schemas: any = Object.assign({}, kind.kind_structure);
        this.validate(provider.prefix, provider.version, kind.name, status, Object.values(kind.kind_structure)[0], schemas,
            allowExtraProps, Object.keys(kind.kind_structure)[0], this.validate_status.name);
    }

    public validate_sfs(provider: Provider) {
        for (let kind of provider.kinds) {
            if (kind.intentful_behaviour === IntentfulBehaviour.Differ) {
                // Throws an exception if it fails
                kind.intentful_signatures.forEach(sig => SFSCompiler.try_parse_sfs(sig.signature, provider.prefix, provider.version, kind.name))
            }
        }
    }

    public validate_provider(provider: Provider) {
        const schemas = {}
        Object.assign(schemas, this.provider_schema)
        Object.assign(schemas, this.procedural_signature_schema)
        this.validate(
            provider.prefix, provider.version, "Provider",
            provider, Object.values(this.provider_schema)[0],
            schemas, true, Object.keys(this.provider_schema)[0], this.validate_provider.name, true)
        Object.values(provider.procedures).forEach(proc => {
            this.check_nullable_modifier_procedure(proc, provider.prefix, provider.version)
            this.validate(
                provider.prefix, provider.version, "ProviderProcedure",
                proc, Object.values(this.procedural_signature_schema)[0],
                schemas, true, Object.keys(this.procedural_signature_schema)[0],
                proc.name, true)
        })
        provider.kinds.forEach(kind => {
            Object.values(kind.kind_procedures).forEach(proc => {
                this.check_nullable_modifier_procedure(proc, provider.prefix, provider.version, kind.name)
                this.validate(
                    provider.prefix, provider.version, kind.name,
                    proc, Object.values(this.procedural_signature_schema)[0],
                    schemas, true, Object.keys(this.procedural_signature_schema)[0],
                    proc.name, true)
            })
            Object.values(kind.entity_procedures).forEach(proc => {
                this.check_nullable_modifier_procedure(proc, provider.prefix, provider.version, kind.name)
                this.validate(
                    provider.prefix, provider.version, kind.name,
                    proc, Object.values(this.procedural_signature_schema)[0],
                    schemas, true, Object.keys(this.procedural_signature_schema)[0],
                    proc.name, true)
            })
            Object.values(kind.intentful_signatures).forEach(proc => {
                this.check_nullable_modifier_procedure(proc, provider.prefix, provider.version, kind.name)
                this.validate(
                    provider.prefix, provider.version, kind.name,
                    proc, Object.values(this.procedural_signature_schema)[0],
                    schemas, true, Object.keys(this.procedural_signature_schema)[0],
                    proc.name, true)
            })
            // Assumption: Kind cannot have more than one kind structure associated with it
            const kind_name = Object.keys(kind.kind_structure)[0]
            this.validate_kind_structure(kind.kind_structure, provider.prefix, provider.version, kind_name)
        })
    }

    validate_kind_structure(schema: Data_Description, provider_prefix: string, provider_version: string, kind_name: string) {
        const x_papiea_field = "x-papiea"
        const status_only_value = FieldBehavior.StatusOnly
        this.check_nullable_modifier(schema, provider_prefix, provider_version, kind_name)
        // x_papiea_field property have only status_only_value value
        this.validate_field_value(schema[kind_name], x_papiea_field, [status_only_value], provider_prefix, provider_version, kind_name)
        this.validate_spec_only_structure(schema[kind_name], provider_prefix, provider_version, kind_name)
        // status-only fields cannot be required in schema
        this.validate_status_only_field(schema, provider_prefix, provider_version, kind_name)
        // warn for untyped object which are not marked as status-only in schema
        const logger = LoggerFactory.makeLogger({});
        this.validate_untyped_object(schema, provider_prefix, provider_version, kind_name, logger)
    }

    validate_field_value(schema: Data_Description, field_name: string, possible_values: string[], provider_prefix: string, provider_version: string, kind_name: string) {
        for (let prop in schema) {
            if (typeof schema[prop] === "object") {
                if (field_name in schema[prop]) {
                    const value = schema[prop][field_name]
                    if (!possible_values.includes(value)) {
                        let message = `${field_name} has wrong value: ${value}, `
                        if (possible_values.length > 0) {
                            message += `correct values are: ${possible_values.toString()}`
                        } else {
                            message += "the field should not be present"
                        }
                        throw new ValidationError([{
                            name: "Error",
                            message: message
                        }], {provider_prefix: provider_prefix, provider_version: provider_version, kind_name: kind_name})
                    }
                } else {
                    this.validate_field_value(schema[prop], field_name, possible_values, provider_prefix, provider_version, kind_name)
                }

            }
        }
    }

    validate_spec_only_structure(entity: Data_Description, provider_prefix: string, provider_version: string, kind_name: string) {
        const spec_only_value = "spec-only"
        const x_papiea_entity_field = "x-papiea-entity"
        const x_papiea_field = "x-papiea"
        if (typeof entity === "object" && entity.hasOwnProperty(x_papiea_entity_field) && entity[x_papiea_entity_field] === spec_only_value) {
            // spec-only entity can't have x_papiea_field values
            this.validate_field_value(entity.properties, x_papiea_field, [], provider_prefix, provider_version, kind_name)
        }
    }

    check_nullable_modifier(schema: Data_Description, provider_prefix: string, provider_version: string, kind_name?: string) {
        for (let field in schema) {
            if (!schema.hasOwnProperty(field)) {
                continue
            }
            const field_schema = schema[field]
            if (field_schema.hasOwnProperty("type")) {
                if (field_schema["type"] === "object") {
                    this.check_nullable_modifier(field_schema["properties"], provider_prefix, provider_version, kind_name)
                }
                if (field_schema.hasOwnProperty("nullable")) {
                    const message = `Papiea doesn't support 'nullable' fields. Please make a field '${field}' non-required instead. for: ${provider_prefix}/${provider_version}`
                    throw new ValidationError([{
                        name: "ValidationError",
                        message: kind_name ? message + `/${kind_name}` : message
                    }], {
                        provider_prefix: provider_prefix,
                        provider_version: provider_version,
                        kind_name: kind_name
                    })
                }
            }
        }
    }

    check_nullable_modifier_procedure(proc: Procedural_Signature, provider_prefix: string, provider_version: string, kind_name?: string) {
       this.check_nullable_modifier(proc.argument, provider_prefix, provider_version, kind_name)
       this.check_nullable_modifier(proc.result, provider_prefix, provider_version, kind_name)
    }

    validate_status_only_field(schema: Data_Description, provider_prefix: string, provider_version: string, kind_name: string) {
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
                                        message: `Field: ${req_field} of type 'status-only' is set to be required. Required fields cannot be 'status-only' for kind ${provider_prefix}/${provider_version}/${kind_name}`
                                    }], { provider_prefix: provider_prefix, provider_version: provider_version, kind_name: kind_name})
                                }
                            }
                        }
                        this.validate_status_only_field(field_schema["properties"], provider_prefix, provider_version, kind_name)
                    }
                    if (field_schema["type"] === "array") {
                        if (field_schema.hasOwnProperty("items") && field_schema["items"].hasOwnProperty("type")) {
                            if (field_schema["items"]["type"].includes("object") && field_schema["items"].hasOwnProperty("required") && field_schema["items"].hasOwnProperty("properties")) {
                                for (let req_field of field_schema["items"]["required"]) {
                                    if (field_schema["items"]["properties"][req_field].hasOwnProperty("x-papiea") && field_schema["items"]["properties"][req_field]["x-papiea"] === "status-only") {
                                        throw new ValidationError([{
                                            name: "ValidationError",
                                            message: `Field: ${req_field} of type 'status-only' is set to be required. Required fields cannot be 'status-only' for kind ${provider_prefix}/${provider_version}/${kind_name}`
                                        }], { provider_prefix: provider_prefix, provider_version: provider_version, kind_name: kind_name})
                                    }
                                }
                                this.validate_status_only_field(field_schema["items"]["properties"], provider_prefix, provider_version, kind_name)
                            }
                        }
                    }
                }
            }
        } catch (e) {
            throw (e)
        }
    }

    validate_untyped_object(schema: Data_Description, provider_prefix: string, provider_version: string, kind_name: string, logger: Logger, field_name: string = '') {
        try {
            for(let field in schema) {
                const field_schema = schema[field]
                if (field_schema.hasOwnProperty("type")) {
                    if (field_schema["type"] === "object") {
                        if ((!field_schema.hasOwnProperty("properties") || field_schema["properties"].length === 0) && (!field_schema.hasOwnProperty("x-papiea") || field_schema["x-papiea"] !== "status-only")) {
                            logger.warn(`Field ${field_name + "/" + field} is an untyped object with no properties for kind: ${provider_prefix}/${provider_version}/${kind_name}. Please check if this is expected.`)
                            return
                        }
                        this.validate_untyped_object(field_schema["properties"], provider_prefix, provider_version, kind_name, logger, field_name + "/" + field)
                    }
                    if (field_schema["type"] === "array") {
                        if (field_schema.hasOwnProperty("items") && field_schema["items"].hasOwnProperty("type") && field_schema["items"]["type"].includes("object")) {
                            if ((!field_schema.hasOwnProperty("properties") || field_schema["properties"].length === 0) && (!field_schema.hasOwnProperty("x-papiea") || field_schema["x-papiea"] !== "status-only")) {
                                logger.warn(`Field ${field_name + "/" + field} is an untyped object with no properties for kind: ${provider_prefix}/${provider_version}/${kind_name}. Please check if this is expected.`)
                                return
                            }
                            this.validate_untyped_object(field_schema["items"]["properties"], provider_prefix, provider_version, kind_name, logger, field_name + "/" + field)
                        }
                    }
                }
            }
        } catch (e) {
            throw (e)
        }
    }

    public validate(
        provider_prefix: string, provider_version: string, kind_name: string,
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
                        ? `Procedure was expecting empty object, received non-empty object for kind ${provider_prefix}/${provider_version}/${kind_name}`
                        : `Schema was expecting empty object, received non-empty object for kind ${provider_prefix}/${provider_version}/${kind_name}`
                }], { provider_prefix: provider_prefix, provider_version: provider_version, kind_name: kind_name, additional_info: { "procedure_name": procedureName ?? '', "schema_name": schemaName, "received_input": JSON.stringify(data) }})
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
                            ? `Procedure was expecting non-empty object, received null/empty object for kind ${provider_prefix}/${provider_version}/${kind_name}`
                            : `Schema was expecting non-empty object, received null/empty object for kind ${provider_prefix}/${provider_version}/${kind_name}`
                    }], { provider_prefix: provider_prefix, provider_version: provider_version, kind_name: kind_name, additional_info: { "procedure_name": procedureName ?? '', "schema_name": schemaName, "received_input": JSON.stringify(data) }})
                }
            }

            const res = this.validator.validate(data, model, models, allowBlankTarget, validatorDenyExtraProps);
            if (!res.valid) {
                convertValidatorMessagesToPapieaMessages(provider_prefix, provider_version, kind_name, res.errors, data, model)
                throw new ValidationError(res.errors, { provider_prefix: provider_prefix, provider_version: provider_version, kind_name: kind_name, additional_info: { "procedure_name": procedureName ?? '' }});
            }
            return res
        } else {
            if (data !== undefined && data !== null && data !== "" && !(Object.entries(data).length === 0 && data.constructor === Object)) {
                throw new ValidationError([{
                    name: "Error",
                    message: procedureName !== undefined
                        ? `Procedure was expecting type void, received non-empty object for kind ${provider_prefix}/${provider_version}/${kind_name}`
                        : `Schema was expecting type void, received non-empty object for kind ${provider_prefix}/${provider_version}/${kind_name}`
                }], { provider_prefix: provider_prefix, provider_version: provider_version, kind_name: kind_name, additional_info: { "procedure_name": procedureName ?? '', "schema_name": schemaName, "received_input": JSON.stringify(data) }})
            }
        }
    }
}

function loadSchema(schemaPath: string): any {
    return load(readFileSync(resolve(__dirname, schemaPath), "utf-8"));
}
