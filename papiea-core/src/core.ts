// [[file:~/work/papiea-js/Papiea-design.org::*/src/core.ts][/src/core.ts:1]]
// This should probably be imported from some library
export type uuid4 = string;

// [[file:~/work/papiea-js/Papiea-design.org::#h-Coretypes-732][core-types]]
// Calback url is just a string
export type Provider_Callback_URL = string;

// Store a struct description parsed from Swagger Model YAML
export type Data_Description = any;

// Lets define a type for a version. For now it may be string, but could be more
// elaborate later on
export type Version = string;
// core-types ends here

export type Secret = string

export enum IntentfulStatus {

    // Intent Watcher is currently waiting for a diff to be resolved
    Active = "Active",

    // All fields were set to the spec value at some point after the spec change was issued
    Completed_Successfully = "Completed Successfully",

    // Some fields were set to the spec value, and some were not due to a newer spec version
    Completed_Partially = "Completed Partially",

    // Next spec version overwrote watched fields
    Outdated = "Outdated",
}

export interface UserInfo {
    [key: string]: any;
}

// The watcher is started by a dedicated scheduler
export interface IntentWatcher {

    // Identifier by which provider can change status of the watcher & user can monitor the execution
    uuid: uuid4

    // Entity being observed by a watcher
    entity_ref: Provider_Entity_Reference

    // Spec version at the time of a spec change
    spec_version: number

    // User who triggered a spec change
    user?: UserInfo

    // Diffs tracked by this watcher
    diffs: Diff[]

    // Current status of the entity
    status: IntentfulStatus

    last_status_changed?: Date

    // Date of creation
    created_at?: Date
}

export interface Provider_Entity_Reference extends Entity_Reference {
    provider_prefix: string;
    provider_version: Version
}

// [[file:~/work/papiea-js/Papiea-design.org::#h-Metadata-350][metadata-struct]]
export interface Metadata extends Provider_Entity_Reference {
    // Identity fields
    spec_version: number;

    // Additional fields
    created_at: Date;
    deleted_at?: Date;
    extension: {
        [key: string]: any;
    }
}
// metadata-struct ends here

// [[file:~/work/papiea-js/Papiea-design.org::#h-Spec-715][spec-struct]]
export type Spec = any;
// spec-struct ends here

// [[file:~/work/papiea-js/Papiea-design.org::#h-Status-990][status-struct]]
export type Status = any;
// status-struct ends here

// [[file:~/work/papiea-js/Papiea-design.org::#h-Entity-43][entity-struct]]
export interface Entity {
  metadata: Metadata;
  spec: Spec;
  status: Status
}
// entity-struct ends here

// [[file:~/work/papiea-js/Papiea-design.org::#h-Interfaces-559][SFS-interfaces]]
// Intentful signature
export type SFS = string;

export interface Intentful_Signature extends Procedural_Signature {
    signature: SFS
}
// SFS-interfaces ends here

// [[file:~/work/papiea-js/Papiea-design.org::#h-Entity-Reference-396][entity-reference-struct]]
export interface Entity_Reference  {
    uuid: uuid4;
    kind: string;

    // This field is optional and is only used help the user identify
    // what this reference is pointing to. 
    name?: string;
}
// entity-reference-struct ends here
// /src/core.ts:1 ends here

export enum IntentfulBehaviour {
    Basic = "basic",
    SpecOnly = "spec-only",
    Differ = "differ"
}

export enum FieldBehavior {
    StatusOnly = "status-only"
}

export interface DiffContent {
    keys: any,
    key: string,
    path: Array<number | string>,
    spec: number[] | string[],
    status: number[] | string[]
}

// The differ is used to locate a diff in an entity between the
// current status and the desired state. 
export interface Differ {

    // Get the next diff from an entity based on the 
    diffs(kind: Kind, spec: Spec, status: Status, logger?: any): Generator<Diff, any, undefined>;

    // We could also get the entire list of diffs, ordered by the
    // original dependency tree
    all_diffs(kind: Kind, spec: Spec, status: Status, logger?: any): Diff[];

    // Get current value by path specified in diff fields
    get_diff_path_value(diff: DiffContent, spec: Spec): any
}

export enum DiffSelectionStrategy {
    Basic = "basic",
    Random = "random"
}

// [[file:~/work/papiea-js/Papiea-design.org::#h-Kind-241][kind-struct]]
export interface Kind {

    // A regex for validating uuid provided
    // If absent, papiea provides its own
    uuid_validation_pattern?: string

    // The name of the kind, and its plural form for proper REST naming
    name: string;
    name_plural?: string;

    //// Entity structure
    kind_structure: Data_Description;

    intentful_behaviour: IntentfulBehaviour;
    //// Intentful behavior
    intentful_signatures: Intentful_Signature[];

    // Every sfs lists the sfs's it has to execute before
    dependency_tree: Map<SFS, SFS[]>;

    // The compiled Differ
    differ?: Differ;

    // The default delay for rediffing
    diff_delay?: number;

    // The default exponent value used in calculate backoff function
    diff_retry_exponent?: number;

    // Strategy which determines how next diff is going to be chosen
    diff_selection_strategy?: DiffSelectionStrategy

    //// Procedural behavior
    entity_procedures: { [key: string]: Procedural_Signature; }
    kind_procedures: { [key: string]: Procedural_Signature; };
}

// [[file:~/work/papiea-js/Papiea-design.org::#h-Intentful-Execution-821][Diff-interface]]
// The Diff structure captures a discovered diff in an entity as well
// as the intentful action that may resolve such diff
export interface Diff {
    kind: string

    intentful_signature: Intentful_Signature,

    // Field diff found by the Differ
    diff_fields: DiffContent[]

    // A uri for a URL which specifically identifies the currently running process.
    // If the URL returns 404 we know that the task was dropped (say, provider crashed).
    // It will use the specific node's IP and not a load balancer IP.
    // This will direct us to the exact location where the task is running.
    // provider handler url with an id to cache the watcher it is assigned to, serves as an identifier for a type of task being executed
    handler_url?: string
}
// Diff-interface ends here
// /src/intentful_core/differ_interface.ts:1 ends here


export interface SpecOnlyEntityKind extends Kind {
}

// kind-struct ends here

// [[file:~/work/papiea-js/Papiea-design.org::#h-Interface-598][entity_procedure-signature]]
// We may want to support different execution strategies. For now we
// can only halt intentful execution for the duration of the
// procedural call
export enum Procedural_Execution_Strategy {Halt_Intentful}
export enum Intentful_Execution_Strategy {Basic}

// Error descriptions in format:
// Map<code, {description, structure}> where code is an error status code as string
// description is a string description of an error
// structure is an OpenAPI object describing internal error structure
// Beware that an Error that user gets in the end is still of
// a PapieaErrorResponse type
export type ErrorSchemas = {
    [ key: string ]: {
        description: string,
        structure: any
    }
}

export interface Procedural_Signature {
    // The name of the entity_procedure to be exported by the engine.
    name: string;

    // The representation of the data to be passed to this entity_procedure
    argument: Data_Description;

    // Description of what the procedure does
    description?: string

    // Error description in format:
    // Map<code, ErrorSchemas> where code is an error status code as string
    // ErrorSchemas structure is an OpenAPI object describing error value
    // Beware that an Error that user gets in the end is still of
    // a PapieaErrorResponse type
    errors_schemas?: ErrorSchemas

    // The representation of the data to be returned from this entity_procedure
    result: Data_Description;

    // Does the engine pauses all intentful operation invocations for
    // the duration of the procedural call
    execution_strategy: Procedural_Execution_Strategy | Intentful_Execution_Strategy;

    // Actions url into the provider
    procedure_callback: Provider_Callback_URL;

    // Base callback used for service discovery, health checks
    base_callback: Provider_Callback_URL
}

// entity_procedure-signature ends here

// [[file:~/work/papiea-js/Papiea-design.org::#h-Provider-description-189][provider-desc-struct]]
export interface Provider {
    // A unique identifier where all kinds will be under this prefix
    prefix: string;
    version: Version;
    kinds: Kind[];
    procedures: { [key: string]: Procedural_Signature; };
    extension_structure: Data_Description
    created_at?: Date;
    policy?: string;
    oauth2?: any;
    authModel?: string;
    allowExtraProps: boolean;
}

export interface S2S_Key {
    name?: string
    owner: string
    provider_prefix: string
    key: Secret
    uuid: string;

    // Additional fields
    created_at: Date
    deleted_at?: Date
    user_info: UserInfo
}

export interface SessionKey {
    key: Secret
    expireAt: Date

    user_info: UserInfo
    idpToken: any
}

export enum PapieaError {
    Validation = "validation_error",
    BadRequest = "bad_request_error",
    ProcedureInvocation = "procedure_invocation_error",
    EntityNotFound = "entity_not_found_error",
    Unauthorized = "unauthorized_error",
    PermissionDenied = "permission_denied_error",
    ConflictingEntity = "conflicting_entity_error",
    ServerError = "server_error",
    OnActionError = "on_action_error",
    PapieaException = "papiea_exception"
}

export interface PapieaResponse {
    error: PapieaErrorResponse
}


// Modeled after https://developers.google.com/drive/api/v3/handle-errors
export interface PapieaErrorResponse {
    errors: { [ key: string ]: any }[]
    code: number
    message: string
    type: PapieaError
    entity_info: { [key: string]: any}
}

export interface PapieaExceptionContext {
    provider_prefix?: string
    provider_version?: string
    kind_name?: string
    additional_info?: { [key: string]: string}
}

export enum Action {
    Read = "read",
    Update = "write",
    Create = "create",
    Delete = "delete",
    RegisterProvider = "register_provider",
    UnregisterProvider = "unregister_provider",
    ReadProvider = "read_provider",
    UpdateAuth = "update_auth",
    CreateS2SKey = "create_key",
    ReadS2SKey = "read_key",
    InactivateS2SKey = "inactive_key",
    UpdateStatus = "update_status",
}

export enum SwaggerValidatorErrorMessages {
    missing_required_ref_str = "Missing required property: $ref",
    additional_props_not_allowed_str = "Additional properties not allowed: ",
    array_short_str = "Array is too short (",
    array_items_not_unique_str = "Array items are not unique (indexes "
}

export enum SwaggerModelValidatorErrorMessage {
    undefined_value_str = 'Unable to validate an undefined value of property: ',
    empty_value_str = 'Unable to validate an empty value for property: ',
    undefined_model_str = 'Unable to validate against an undefined model.',
    type_mismatch_str = 'Unable to validate a model with a type: ',
    additional_input_field_str = 'Target property \'',
    non_string_type_field_str = 'Schema property (',
    not_object_type_str = ' is not a type of object. It is a type of ',
    not_array_type_str = ' is not an array. An array is expected.',
    required_field_no_value_str = ' is a required field',
    required_field_missing_schema_str = 'object does not have property ',
}