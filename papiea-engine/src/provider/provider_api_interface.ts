import { UserAuthInfo } from "../auth/authn";
import { Provider, Version, Entity_Reference, Status, S2S_Key } from "papiea-core";
import {RequestContext} from "papiea-backend-utils"


// This will be provided using REST APIs. 

export enum Provider_Power { On, Off, Suspended }

export interface Provider_API {

    // Registers a provider to the Provider's DB
    // POST "/provider"
    register_provider(user: UserAuthInfo, provider: Provider, context: RequestContext): Promise<void>;

    list_providers(user: UserAuthInfo, context: RequestContext): Promise<Provider[]>;

    // DELETE "/provider/{prefix}/{version}"
    unregister_provider(user: UserAuthInfo, provider_prefix: string, version: Version, context: RequestContext): Promise<void>;

    // Replace status with a specified one
    replace_status(user: UserAuthInfo, provider_prefix: string, version: Version, entity_ref: Entity_Reference, status: Status, context: RequestContext): Promise<void>;

    // POST "/provider/update_progress"
    update_progress(user: UserAuthInfo, provider_prefix: string, version: Version, message: string, done_percent: number, context: RequestContext): Promise<void>;

    power(user: UserAuthInfo, provider_prefix: string, version: Version, power_state: Provider_Power, context: RequestContext): Promise<void>;

    get_provider(user: UserAuthInfo, provider_prefix: string, provider_version: Version, context: RequestContext): Promise<Provider>;

    list_providers_by_prefix(user: UserAuthInfo, provider_prefix: string, context: RequestContext): Promise<Provider[]>;

    update_auth(user: UserAuthInfo, provider_prefix: string, provider_version: Version, auth: any, context: RequestContext): Promise<void>;

    update_status(user: UserAuthInfo, provider_prefix: string, version: Version, entity_ref: Entity_Reference, status: Status, context: RequestContext): Promise<void>;

    create_key(user: UserAuthInfo, name: string, owner: string, provider_prefix: string, context: RequestContext, extension?: any, key?: string): Promise<S2S_Key>;

    get_key(user: UserAuthInfo, uuid: string, context: RequestContext): Promise<S2S_Key>;

    inactivate_key(user: UserAuthInfo, uuid: string, context: RequestContext): Promise<void>;

    filter_keys(user: UserAuthInfo, fields: any, context: RequestContext): Promise<S2S_Key[]>;
}
