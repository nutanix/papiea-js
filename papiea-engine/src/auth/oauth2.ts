import { Router } from "express"
import { asyncHandler, UserAuthInfo } from "./authn"
import { Provider_DB } from "../databases/provider_db_interface"
import { extract_property } from "./user_data_evaluator"
import { Provider } from "papiea-core"
import { SessionKeyAPI } from "./session_key"
import uuid = require("uuid")
import { Logger } from 'papiea-backend-utils'

const simpleOauthModule = require("simple-oauth2"),
    queryString = require("query-string"),
    url = require("url");


function getUserInfoFromToken(token: any, provider: Provider): UserAuthInfo {
    const extracted_headers = extract_property({ token }, provider.oauth2, "headers")
    const user_info: UserAuthInfo = { ...extracted_headers }
    return user_info
}


function convertToSimpleOauth2(description: any) {
    const oauth = description.oauth;
    const simple_oauth_config = {
        client: {
            id: oauth.client_id,
            secret: oauth.client_secret
        },
        auth: {
            tokenHost: oauth.auth_host,
            tokenPath: oauth.token_uri,
            authorizePath: oauth.authorize_uri,
            revokePath: oauth.revoke_uri
        },
        options: {
            authorizationMethod: "body",
            bodyFormat: "form"
        }
    };
    return simple_oauth_config;
}

export function getOAuth2(provider: Provider) {
    const converted_oauth = convertToSimpleOauth2(provider.oauth2);
    return simpleOauthModule.create(converted_oauth);
}


export function createOAuth2Router(logger: Logger, redirect_uri: string, providerDb: Provider_DB, sessionKeyAPI: SessionKeyAPI): Router {
    const router = Router();

    router.use('/provider/:prefix/:version/auth/login', asyncHandler(async (req, res) => {
        const provider: Provider = await providerDb.get_provider(req.params.prefix, req.params.version);
        const oauth2 = getOAuth2(provider);
        const state = {
            provider_prefix: provider.prefix,
            provider_version: provider.version,
            redirect_uri: req.query.redirect_uri
        };
        const options = {
            redirect_uri: redirect_uri,
            state: queryString.stringify(state),
            scope: "openid",
        };
        const authorizationUri = oauth2.authorizationCode.authorizeURL(options);
        res.redirect(authorizationUri);
    }));

    router.use('/provider/:prefix/:version/auth/logout', asyncHandler(async (req, res) => {
        const provider: Provider = await providerDb.get_provider(req.params.prefix, req.params.version);
        const oauth2 = getOAuth2(provider);
        const token = req.user.authorization.split(' ')[1]
        const sessionKey = await sessionKeyAPI.getKey(token, oauth2, provider.prefix, provider.version)
        const idpToken = oauth2.accessToken.create({ "access_token": sessionKey.idpToken.token.access_token });
        try {
            await sessionKeyAPI.inactivateKey(sessionKey.key)
            await idpToken.revoke('access_token');
        } catch (e) {
            logger.error(`Failed to logout user with token: ${token} in provider with prefix: ${provider.prefix} and version: ${provider.version} due to error: ${e.message}`);
            return res.status(400).json("Logout failed");
        }
        const logoutUrl = new url.URL(provider.oauth2.oauth.logout_uri, provider.oauth2.oauth.auth_host);
        return res.status(200).json({"logout_uri": `${logoutUrl.href}`});
    }));

    router.use('/provider/auth/callback', asyncHandler(async (req, res, next) => {
        const code = req.query.code;
        const state = queryString.parse(req.query.state);
        const provider: Provider = await providerDb.get_provider(state.provider_prefix, state.provider_version);
        const oauth2 = getOAuth2(provider);
        try {
            const result = await oauth2.authorizationCode.getToken({
                code,
                redirect_uri
            });
            const token = oauth2.accessToken.create(result);
            const key = uuid()
            const userInfo = getUserInfoFromToken(token.token, provider)
            userInfo.authorization = `Bearer ${key}`
            const sessionKey = await sessionKeyAPI.createKey(userInfo, token, key, oauth2, provider.prefix, provider.version)
            if (state.redirect_uri) {
                const client_url = new url.URL(state.redirect_uri);
                client_url.searchParams.append("token", sessionKey.key);
                return res.redirect(client_url.toString());
            } else {
                return res.status(200).json({ token: sessionKey.key });
            }
        } catch (e) {
            logger.error(`Failed to access token for user with code: ${code} in provider: ${provider.prefix}/${provider.version} due to error: ${e.message}`);
            return res.status(500).json('Authentication failed');
        }
    }));

    return router;
}
