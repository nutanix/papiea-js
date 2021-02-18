import {Provider_DB} from "../databases/provider_db_interface"
import {FieldBehavior, IntentfulBehaviour, Kind, Procedural_Signature, Provider, SwaggerValidatorErrorMessages} from "papiea-core"
import { ValidationError } from "../errors/validation_error";

const SwaggerParser = require("@apidevtools/swagger-parser");

function getConstructorProcedureName(kind: Kind): string {
    return `__${kind.name}_create`
}

function translateSwaggerErrors(swaggerErrors: any, translatedErrors: Error[], path: string = '') {
    swaggerErrors.forEach((error: any) => {
        if (error.hasOwnProperty("inner")) {
            translateSwaggerErrors(error.inner, translatedErrors, error.path.join('.'))
        } else {
            // Translate message for the inner most error structure
            if (!path.includes("-Spec") && !path.includes("-Status")) {
                if (error.message !== SwaggerValidatorErrorMessages.missing_required_ref_str) {
                    let message: string  = error.message
                    path = path.replace("paths.", "")
                    path = path.replace("components.schemas.", "")
                    if (error.message.includes(SwaggerValidatorErrorMessages.additional_props_not_allowed_str)) {
                        const fieldName = error.message.replace(SwaggerValidatorErrorMessages.additional_props_not_allowed_str, "")
                        message = `Schema has invalid name for the field: ${path}.${fieldName}`
                    } else if (error.message.includes(SwaggerValidatorErrorMessages.array_short_str)) {
                        error.message = error.message.replace(SwaggerValidatorErrorMessages.array_short_str, "")
                        const actualSize = error.message.slice(0, error.message.indexOf(')'))
                        const minimumSize = error.message.replace(`${actualSize}), minimum `, "")
                        const fieldName = error.path[error.path.length-1]
                        message = `Expected list for schema field: ${path}.${fieldName} to have minimum size: ${minimumSize}, received size: ${actualSize}`
                    } else if (error.message.includes(SwaggerValidatorErrorMessages.array_items_not_unique_str)) {
                        error.message = error.message.replace(SwaggerValidatorErrorMessages.array_items_not_unique_str, "")
                        const index1 = error.message.slice(0, error.message.indexOf(" "))
                        error.message = error.message.replace(`${index1} and `, "")
                        const index2 = error.message.substring(0, error.message.length - 1)
                        const fieldName = error.path[error.path.length-1]
                        message = `Schema field: ${path}.${fieldName} has duplicate values at indexes ${index1} and ${index2}`
                    }
                    translatedErrors.push(new Error(message))
                }
            }
        }
    })
}

async function validateOpenAPISchema(root: any) {
    try {
        await SwaggerParser.validate(root);
    } catch(err) {
        let translatedErrors: Error[] = []
        translateSwaggerErrors(err.details, translatedErrors)
        if (translatedErrors.length > 0) {
            throw new ValidationError(translatedErrors)
        }
    }
}

export default class ApiDocsGenerator {
    providerDb: Provider_DB;

    constructor(providerDb: Provider_DB) {
        this.providerDb = providerDb;
    }

    getMetadata(pattern?: string) {
        const metadata = {
            "Metadata": {
                "required": [
                    "uuid",
                    "kind",
                    "spec_version"
                ],
                "properties": {
                    "uuid": {
                        "type": "string",
                    },
                    "kind": {
                        "type": "string"
                    },
                    "spec_version": {
                        "type": "integer",
                        "format": "int32"
                    },
                    "created_at": {
                        "type": "string",
                        "format": "date-time"
                    },
                    "deleted_at": {
                        "type": "string",
                        "format": "date-time"
                    }
                }
            }
        }
        if (pattern) {
            (metadata.Metadata.properties.uuid as any)["pattern"] = pattern
        } else {
            (metadata.Metadata.properties.uuid as any)["format"] = "uuid"
        }
        return metadata
    }

    getDefaultResponse() {
        return {
            "description": "Unexpected error",
            "content": {
                "application/json": {
                    "schema": {
                        "$ref": "#/components/schemas/Error"
                    }
                }
            }
        };
    }

    getResponseMany(kind: Kind) {
        return {
            "200": {
                "description": `${ kind.name } response`,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "array",
                            "items": {
                                "required": ["metadata", "spec"],
                                "properties": {
                                    "metadata": {
                                        "$ref": `#/components/schemas/${ kind.name }-Metadata`
                                    },
                                    "spec": {
                                        "$ref": `#/components/schemas/${ kind.name }-Spec`
                                    },
                                    "status": {
                                        "type": `#/components/schemas/${ kind.name }-Status`
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "default": this.getDefaultResponse()
        };
    }

    getPaginatedResponse(kind: Kind) {
        return {
            "200": {
                "description": `${ kind.name } response`,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "results": {
                                    "type": "array",
                                    "items": {
                                        "required": ["metadata", "spec"],
                                        "properties": {
                                            "metadata": {
                                                "$ref": `#/components/schemas/${ kind.name }-Metadata`
                                            },
                                            "spec": {
                                                "$ref": `#/components/schemas/${ kind.name }-Spec`
                                            },
                                            "status": {
                                                "$ref": `#/components/schemas/${ kind.name }-Status`
                                            }
                                        }
                                    }
                                },
                                "entity_count": {
                                    "type": "integer",
                                    "format": "int32"
                                }
                            }
                        }
                    }
                }
            },
            "default": this.getDefaultResponse()
        };
    }

    getResponseSingle(kind: Kind) {
        return {
            "200": {
                "description": `${ kind.name } response`,
                "content": {
                    "application/json": {
                        "schema": {
                            "required": ["metadata", "spec"],
                            "properties": {
                                "metadata": {
                                    "$ref": `#/components/schemas/${ kind.name }-Metadata`
                                },
                                "spec": {
                                    "$ref": `#/components/schemas/${ kind.name }-Spec`
                                },
                                "status": {
                                    "$ref": `#/components/schemas/${ kind.name }-Status`
                                }
                            }
                        }
                    }
                }
            },
            "default": this.getDefaultResponse()
        }
    }

    getResponseConstructor(kind: Kind) {
        return {
            "200": {
                "description": `${ kind.name } response`,
                "content": {
                    "application/json": {
                        "schema": {
                            "required": ["metadata", "spec", "status"],
                            "properties": {
                                "metadata": {
                                    "$ref": `#/components/schemas/${ kind.name }-Metadata`
                                },
                                "spec": {
                                    "$ref": `#/components/schemas/${ kind.name }-Spec`
                                },
                                "status": {
                                    "$ref": `#/components/schemas/${ kind.name }-Status`
                                },
                                "intent_watcher": {
                                    "type": "object"
                                }
                            }
                        }
                    }
                }
            },
            "default": this.getDefaultResponse()
        }
    }

    getKind(provider: Provider, kind: Kind) {
        return {
            "description": `Returns all entities' specs of kind ${ kind.name }`,
            "operationId": `find${ provider.prefix }${ kind.name }`,
            "tags": [`${ provider.prefix }/${ provider.version }/${ kind.name }`],
            "parameters": [
                {
                    "name": "offset",
                    "in": "query",
                    "description": "offset of results to return",
                    "required": false,
                    "schema": {
                        "type": "integer",
                        "format": "int32"
                    }
                },
                {
                    "name": "limit",
                    "in": "query",
                    "description": "maximum number of results to return",
                    "required": false,
                    "schema": {
                        "type": "integer",
                        "format": "int32"
                    }
                },
                {
                    "name": "spec",
                    "in": "query",
                    "description": "jsonified spec filter",
                    "required": false,
                    "schema": {
                        "type": "string"
                    }
                }
            ],
            "responses": this.getPaginatedResponse(kind)
        };
    }

    postKindFilter(provider: Provider, kind: Kind) {
        return {
            "description": `Returns all entities' specs of kind ${ kind.name }`,
            "operationId": `find${ provider.prefix }${ kind.name }Filter`,
            "tags": [`${ provider.prefix }/${ provider.version }/${ kind.name }`],
            "parameters": [
                {
                    "name": "offset",
                    "in": "query",
                    "description": "offset of results to return",
                    "required": false,
                    "schema": {
                        "type": "integer",
                        "format": "int32"
                    }
                },
                {
                    "name": "limit",
                    "in": "query",
                    "description": "maximum number of results to return",
                    "required": false,
                    "schema": {
                        "type": "integer",
                        "format": "int32"
                    }
                }
            ],
            "requestBody": {
                "description": `${ kind.name } to retrieve`,
                "required": false,
                "content": {
                    "application/json": {
                        "schema": {
                            "properties": {
                                "spec": {
                                    "$ref": `#/components/schemas/${ kind.name }-Spec`
                                }
                            }
                        }
                    }
                }
            },
            "responses": this.getPaginatedResponse(kind)
        };
    }

    postKind(provider: Provider, kind: Kind) {
        return {
            "description": `Creates a new instance of ${kind.name}. The created entity will have no diffs upon creation since this default constructor sets status to be the same as spec`,
            "operationId": `add${ provider.prefix }${ kind.name }`,
            "tags": [`${ provider.prefix }/${ provider.version }/${ kind.name }`],
            "requestBody": {
                "description": `${ kind.name } to create`,
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "properties": {
                                "spec": {
                                    "$ref": `#/components/schemas/${ kind.name }-Spec`
                                },
                                "metadata": {
                                    "$ref": `#/components/schemas/${ kind.name }-Metadata`
                                }
                            }
                        }
                    }
                }
            },
            "responses": this.getResponseSingle(kind)
        };
    }

    getKindEntity(provider: Provider, kind: Kind) {
        return {
            "description": `Returns an entity of kind ${ kind.name } by uuid`,
            "operationId": `find${ provider.prefix }${ kind.name }ByUuid`,
            "tags": [`${ provider.prefix }/${ provider.version }/${ kind.name }`],
            "parameters": [
                {
                    "name": "uuid",
                    "in": "path",
                    "description": "UUID of the entity",
                    "required": true,
                    "schema": {
                        "type": "string",
                        "format": "uuid"
                    }
                }
            ],
            "responses": this.getResponseSingle(kind)
        };
    }

    deleteKindEntity(provider: Provider, kind: Kind) {
        return {
            "description": `Deletes an entity of kind ${ kind.name } by uuid`,
            "operationId": `delete${ provider.prefix }${ kind.name }`,
            "tags": [`${ provider.prefix }/${ provider.version }/${ kind.name }`],
            "parameters": [
                {
                    "name": "uuid",
                    "in": "path",
                    "description": "UUID of the entity",
                    "required": true,
                    "schema": {
                        "type": "string",
                        "format": "uuid"
                    }
                }
            ],
            "responses": {
                "204": {
                    "description": `${ kind.name } deleted`
                },
                "default": this.getDefaultResponse()
            }
        };
    }

    putKindEntity(provider: Provider, kind: Kind) {
        return {
            "description": `Replaces an entity of kind ${ kind.name } by uuid`,
            "operationId": `replace${ provider.prefix }${ kind.name }`,
            "tags": [`${ provider.prefix }/${ provider.version }/${ kind.name }`],
            "parameters": [
                {
                    "name": "uuid",
                    "in": "path",
                    "description": "UUID of the entity",
                    "required": true,
                    "schema": {
                        "type": "string",
                        "format": "uuid"
                    }
                },
            ],
            "requestBody": {
                "description": `${ kind.name } to replace with`,
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "properties": {
                                "spec": {
                                    "$ref": `#/components/schemas/${ kind.name }-Spec`
                                },
                                "metadata": {
                                    "properties": {
                                        "spec_version": {
                                            "type": "integer"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "responses": this.getResponseSingle(kind)
        };
    }

    patchKindEntity(provider: Provider, kind: Kind) {
        return {
            "description": `Updates an entity of kind ${ kind.name } by uuid`,
            "operationId": `update${ provider.prefix }${ kind.name }`,
            "tags": [`${ provider.prefix }/${ provider.version }/${ kind.name }`],
            "parameters": [
                {
                    "name": "uuid",
                    "in": "path",
                    "description": "UUID of the entity",
                    "required": true,
                    "schema": {
                        "type": "string",
                        "format": "uuid"
                    }
                }
            ],
            "requestBody": {
                "description": `Patch to update with`,
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "$ref": `#/components/schemas/PatchRequest`
                        }
                    }
                }
            },
            "responses": this.getResponseSingle(kind)
        };
    }

    processEmptyValidation(proc_def: any, sig: Procedural_Signature) {
        if (Object.entries(sig.argument).length === 0 && sig.argument.constructor === Object) {
            proc_def.requestBody.content["application/json"].schema['$ref'] = `#/components/schemas/Nothing`
        }
        if (Object.entries(sig.result).length === 0 && sig.result.constructor === Object) {
            proc_def.responses["200"].content["application/json"].schema["$ref"] = `#/components/schemas/Nothing`
        }
        return proc_def
    }

    processCustomErrorDescriptions(proc_def: any, sig: Procedural_Signature) {
        const get_error_response = (description: string, structure: any) => {
            return {
                "description": description,
                "content": {
                    "application/json": {
                        "schema": {
                            "required": [
                                "error",
                            ],
                            "properties": {
                                "error": {
                                    "type": "object",
                                    "required": [
                                        "errors",
                                        "code",
                                        "message"
                                    ],
                                    "properties": {
                                        "errors": {
                                            "type": "array",
                                            "items": structure
                                        },
                                        "code": {
                                            "type": "integer"
                                        },
                                        "message": {
                                            "type": "string"
                                        },
                                        "type": {
                                            "type": "string"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if (sig.errors_schemas) {
            for (let [key, val] of Object.entries(sig.errors_schemas)) {
                if (proc_def.responses[key] === undefined) {
                    proc_def.responses[key] = get_error_response(val.description, val.structure)
                }
            }
        }
    }

    getProcedureSchema(base: string, procedure: Procedural_Signature): [string, string] {
        let inputSchemaName = `${base}-Input`
        let outputSchemaName = `${base}-Output`
        if (Object.keys(procedure.argument).length === 1) {
            inputSchemaName = `${base}-${Object.keys(procedure.argument)[0]}`
        }
        if (Object.keys(procedure.result).length === 1) {
            outputSchemaName = `${base}-${Object.keys(procedure.result)[0]}`
        }
        return [inputSchemaName, outputSchemaName]
    }

    getKindProcedureSchema = (provider: Provider, kind: Kind, procedure: Procedural_Signature): [string, string] => {
        const base = `${provider.prefix}-${provider.version}-${kind.name}-${procedure.name}`
        return this.getProcedureSchema(base, procedure)
    }

    callConstructorProcedure(provider: Provider, kind: Kind, procedure: Procedural_Signature) {
        const [input, _] = this.getKindProcedureSchema(provider, kind, procedure)
        const procedural_def = {
            "description": `Creates a new instance of ${kind.name} based on the provided input parameters. The created entity may have diffs upon creation which will get resolved in the usual way.`,
            "operationId": `add${ provider.prefix }${ kind.name }`,
            "tags": [`${ provider.prefix }/${ provider.version }/${ kind.name }`],
            "requestBody": {
                "description": `${ procedure.name } input`,
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "$ref": `#/components/schemas/${ input }`
                        }
                    }
                }
            },
            "responses": this.getResponseConstructor(kind)
        };
        this.processCustomErrorDescriptions(procedural_def, procedure)
        return this.processEmptyValidation(procedural_def, procedure)
    }

    callKindProcedure(provider: Provider, kind: Kind, procedure: Procedural_Signature) {
        const [input, output] = this.getKindProcedureSchema(provider, kind, procedure)
        const default_description = `Calls a procedure ${ procedure.name }`
        const procedural_def = {
            "description": `${ procedure.description ?? default_description }`,
            "operationId": `call${ provider.prefix }${kind.name}${ procedure.name }`,
            "tags": [`${ provider.prefix }/${ provider.version }/${ kind.name }/procedure`],
            "requestBody": {
                "description": `${ procedure.name } input`,
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "$ref": `#/components/schemas/${ input }`
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": `${ procedure.name } response`,
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": `#/components/schemas/${ output }`
                            }
                        }
                    }
                },
                "default": this.getDefaultResponse()
            }
        };
        this.processCustomErrorDescriptions(procedural_def, procedure)
        return this.processEmptyValidation(procedural_def, procedure)
    }

    getEntityProcedureSchema = (provider: Provider, kind: Kind, procedure: Procedural_Signature): [string, string] => {
        const base = `${provider.prefix}-${provider.version}-${kind.name}-${procedure.name}`
        return this.getProcedureSchema(base, procedure)
    }

    callEntityProcedure(provider: Provider, kind: Kind, procedure: Procedural_Signature) {
        const [input, output] = this.getEntityProcedureSchema(provider, kind, procedure)
        const default_description = `Calls a procedure ${ procedure.name }`
        const procedural_def = {
            "description": `${ procedure.description ?? default_description }`,
            "operationId": `call_entity${ provider.prefix }${kind.name}${ procedure.name }`,
            "tags": [`${ provider.prefix }/${ provider.version }/${ kind.name }/procedure`],
            "parameters": [
                {
                    "name": "uuid",
                    "in": "path",
                    "description": "UUID of the entity",
                    "required": true,
                    "schema": {
                        "type": "string",
                        "format": "uuid"
                    }
                },
            ],
            "requestBody": {
                "description": `${ procedure.name } input`,
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "$ref": `#/components/schemas/${ input }`
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": `${ procedure.name } response`,
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": `#/components/schemas/${ output }`
                            }
                        }
                    }
                },
                "default": this.getDefaultResponse()
            }
        };
        this.processCustomErrorDescriptions(procedural_def, procedure)
        return this.processEmptyValidation(procedural_def, procedure)
    }

    getProviderProcedureSchema = (provider: Provider, kind: Kind, procedure: Procedural_Signature): [string, string] => {
        const base = `${provider.prefix}-${provider.version}-${procedure.name}`
        return this.getProcedureSchema(base, procedure)
    }

    callProviderProcedure(provider: Provider, procedure: Procedural_Signature) {
        const [input, output] = this.getProviderProcedureSchema(provider, {} as Kind, procedure)
        const default_description = `Calls a procedure ${ procedure.name }`
        const procedural_def = {
            "description": `${ procedure.description ?? default_description }`,
            "operationId": `call${ provider.prefix }${ procedure.name }`,
            "tags": [`${ provider.prefix }/${ provider.version }/procedure`],
            "requestBody": {
                "description": `${ procedure.name } input`,
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "$ref": `#/components/schemas/${ input }`
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": `${ procedure.name } response`,
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": `#/components/schemas/${ output }`
                            }
                        }
                    }
                },
                "default": this.getDefaultResponse()
            }
        };
        this.processCustomErrorDescriptions(procedural_def, procedure)
        return this.processEmptyValidation(procedural_def, procedure)
    }

    setSecurityScheme() {
        return {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT"
                }
            }
        }
    }

    setSecurity() {
        return {
            "security": [
                {
                    "bearerAuth": []
                }
            ]
        }
    }

    /**
     * Recursively removes a field from required if it has to be shown only for the opposite type.
     * @param schema - schema to remove the required from.
     * @param fieldName - type of x-papiea value spec-only|status-only.
     */
    removeRequiredField(schema: any, fieldName: string) {
        for (let prop in schema) {
            // check that it's a object holding properties
            if (typeof schema[prop] === 'object' && schema[prop].hasOwnProperty("required") && schema[prop].hasOwnProperty("properties")) {
                const fieldsToRemove: string[] = []
                const properties = schema[prop]["properties"]
                for (let name in properties) {
                    const field = properties[name]
                    // if property has value of `fieldname` we should remove it from required
                    if (typeof field === 'object' && field.hasOwnProperty("x-papiea") && field["x-papiea"] === fieldName) {
                        fieldsToRemove.push(name)
                    }

                }
                schema[prop]["required"] = schema[prop]["required"].filter((field: string) => !fieldsToRemove.includes(field))
                if (schema[prop]["required"].length === 0 ){
                    delete schema[prop]["required"]
                }

            }
            if (typeof schema[prop] === 'object') {
                // check for child objects as they may be object structures with required fields
                this.removeRequiredField(schema[prop], fieldName)
            }
        }
    }

    /**
     * Recursively removes a field from properties if it has to be shown only for the opposite type.
     * @param schema - schema to remove the fields from.
     * @param fieldName - type of x-papiea value spec-only|status-only.
     */
    removeSchemaField(schema: any, fieldName: string) {
        for (let prop in schema) {
            if (typeof schema[prop] === 'object' && "x-papiea" in schema[prop] && schema[prop]["x-papiea"] === fieldName) {
                delete schema[prop]
            } else if (typeof schema[prop] === 'object')
                this.removeSchemaField(schema[prop], fieldName)
        }
    }

    createSchema(schemas: any, kind: Kind, type: string) {
        const kindSchema: any = JSON.parse(JSON.stringify(kind.kind_structure))
        const schemaName = Object.keys(kindSchema)[0]
        if (type === "spec") {
            kindSchema[ `${ schemaName }-Spec` ] = kindSchema[ schemaName ]
            delete kindSchema[ schemaName ]
            this.removeRequiredField(kindSchema, FieldBehavior.StatusOnly)
            this.removeSchemaField(kindSchema, FieldBehavior.StatusOnly)
        } else if (type === "metadata") {
            kindSchema[ `${ schemaName }-Metadata` ] = this.getMetadata(kind.uuid_validation_pattern)["Metadata"]
        } else {
            kindSchema[`${schemaName}-Status`] = kindSchema[schemaName]
            delete kindSchema[schemaName]
            this.removeSchemaField(kindSchema, IntentfulBehaviour.SpecOnly)
        }
        Object.assign(schemas, kindSchema)
    }

    addProcedureSchema(provider: Provider,
                       kind: Kind,
                       proceduralSignature: Procedural_Signature,
                       schemas: any,
                       transformNameFn: (provider: Provider, kind: Kind, procedure: Procedural_Signature) => [string, string]) {
        let inputSchemaDesc: any
        let outputSchemaDesc: any
        if (Object.keys(proceduralSignature.argument).length === 1) {
            const inputName = Object.keys(proceduralSignature.argument)[0]
            inputSchemaDesc = proceduralSignature.argument[inputName]
        } else {
            inputSchemaDesc = proceduralSignature.argument
        }
        if (Object.keys(proceduralSignature.result).length === 1) {
            const outputName = Object.keys(proceduralSignature.result)[0]
            outputSchemaDesc = proceduralSignature.result[outputName]
        } else {
            outputSchemaDesc = proceduralSignature.result
        }
        const [transformedInputName, transformedOutputName] = transformNameFn(provider, kind, proceduralSignature)
        proceduralSignature.argument = {[transformedInputName]: inputSchemaDesc}
        proceduralSignature.result = {[transformedOutputName]: outputSchemaDesc}
        Object.assign(schemas, proceduralSignature.argument)
        Object.assign(schemas, proceduralSignature.result)
    }

    async getApiDocs(provider: Provider): Promise<any> {
        const root: any = {
            "openapi": "3.0.0",
            "info": {
                "version": "1.0.0",
                "title": "Swagger Papiea",
                "description": "An API specification of Papiea-JS",
                "license": {
                    "name": "LICENSE",
                    "url": "https://github.com/nutanix/papiea-js/blob/master/LICENSE"
                }
            },
            "servers": [
                {
                    "url": "/"
                }
            ],
            "externalDocs": {
                "description": "Main page",
                "url": "/api-docs"
            },
            "paths": {},
            "components": {
                "schemas": {
                    "Error": {
                        "required": [
                            "error",
                        ],
                        "properties": {
                            "error": {
                                "type": "object",
                                "required": [
                                    "errors",
                                    "code",
                                    "message"
                                ],
                                "properties": {
                                    "errors": {
                                        "type": "array",
                                        "items": {
                                            "type": "object"
                                        }
                                    },
                                    "code": {
                                        "type": "integer"
                                    },
                                    "message": {
                                        "type": "string"
                                    },
                                    "type": {
                                        "type": "string"
                                    }
                                }
                            }
                        }
                    },
                    "Metadata": {
                        "required": [
                            "uuid",
                            "kind",
                            "spec_version"
                        ],
                        "properties": {
                            "uuid": {
                                "type": "string",
                                "format": "uuid"
                            },
                            "kind": {
                                "type": "string"
                            },
                            "spec_version": {
                                "type": "integer",
                                "format": "int32"
                            },
                            "created_at": {
                                "type": "string",
                                "format": "date-time"
                            },
                            "deleted_at": {
                                "type": "string",
                                "format": "date-time"
                            }
                        }
                    },
                    "Nothing": {
                        "type": "object",
                        "description": "Representation of a 'void' type"
                    }
                    /*"PatchRequest": {
                        "type": "array",
                        "items": {
                            "$ref": "#/components/schemas/PatchDocument"
                        }
                    },
                    "PatchDocument": {
                        "description": "A JSONPatch document as defined by RFC 6902",
                        "required": [
                            "op",
                            "path"
                        ],
                        "properties": {
                            "op": {
                                "type": "string",
                                "description": "The operation to be performed",
                                "enum": [
                                    "add",
                                    "remove",
                                    "replace",
                                    "move",
                                    "copy",
                                    "test"
                                ]
                            },
                            "path": {
                                "type": "string",
                                "description": "A JSON-Pointer"
                            },
                            "value": {
                                "type": "object",
                                "description": "The value to be used within the operations."
                            },
                            "from": {
                                "type": "string",
                                "description": "A string containing a JSON Pointer value."
                            }
                        }
                    }*/
                }
            }
        };

        const paths = root.paths;
        const schemas = root.components.schemas;
        provider.kinds.forEach(kind => {
            const constructor_procedure = Object.values(kind.kind_procedures).filter(proc => {
                if (proc.name === getConstructorProcedureName(kind)) {
                    return proc
                }
            })[0]
            paths[`/services/${ provider.prefix }/${ provider.version }/${ kind.name }`] = {
                "get": this.getKind(provider, kind),
                "post":
                    constructor_procedure
                        ? this.callConstructorProcedure(provider, kind, constructor_procedure)
                        : this.postKind(provider, kind)
            };
            paths[`/services/${ provider.prefix }/${ provider.version }/${ kind.name }/filter`] = {
                "post": this.postKindFilter(provider, kind)
            };
            paths[`/services/${ provider.prefix }/${ provider.version }/${ kind.name }/{uuid}`] = {
                "get": this.getKindEntity(provider, kind),
                "delete": this.deleteKindEntity(provider, kind),
                "put": this.putKindEntity(provider, kind)
            };
            if (kind.kind_procedures) {
                Object.values(kind.kind_procedures).forEach(procedure => {
                    // Hide constructor from OpenAPI spec
                    if (procedure.name !== getConstructorProcedureName(kind)) {
                        paths[`/services/${ provider.prefix }/${ provider.version }/${ kind.name }/procedure/${ procedure.name }`] = {
                            "post": this.callKindProcedure(provider, kind, procedure)
                        }
                    }
                    this.addProcedureSchema(provider, kind, procedure, schemas, this.getKindProcedureSchema)
                });
            }
            if (kind.entity_procedures) {
                Object.values(kind.entity_procedures).forEach(procedure => {
                    paths[`/services/${ provider.prefix }/${ provider.version }/${ kind.name }/{uuid}/procedure/${ procedure.name }`] = {
                        "post": this.callEntityProcedure(provider, kind, procedure)
                    };
                    this.addProcedureSchema(provider, kind, procedure, schemas, this.getEntityProcedureSchema)
                });
            }
            this.createSchema(schemas, kind, "spec")
            this.createSchema(schemas, kind, "status")
            this.createSchema(schemas, kind, "metadata")
        });
        if (provider.procedures) {
            Object.values(provider.procedures).forEach(procedure => {
                paths[`/services/${ provider.prefix }/${ provider.version }/procedure/${ procedure.name }`] = {
                    "post": this.callProviderProcedure(provider, procedure)
                };
                this.addProcedureSchema(provider, {} as Kind, procedure, schemas, this.getProviderProcedureSchema)
            });
        }

        Object.assign(root.components, this.setSecurityScheme());
        Object.assign(root, this.setSecurity());

        // Copying root object using JSON methods since shallow copy causes
        // the root model's refs to be resolved and creates redundancy in
        // the OpenAPI schema.
        await validateOpenAPISchema(JSON.parse(JSON.stringify(root)))

        return root;
    }
}
