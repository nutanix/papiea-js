import "jest";
import axios from "axios";
import * as http from "http";
const url = require("url");
const queryString = require("query-string");
import { OAuth2Server, ProviderBuilder } from "../test_data_factory"
import uuid = require("uuid");
import { Metadata, Spec, Provider } from "papiea-core";
import { Logger, LoggerFactory } from 'papiea-backend-utils';

declare var process: {
    env: {
        SERVER_PORT: string,
        PAPIEA_ADMIN_S2S_KEY: string
    }
};
const serverPort = parseInt(process.env.SERVER_PORT || '3000');
const adminKey = process.env.PAPIEA_ADMIN_S2S_KEY || '';

const entityApiAdmin = axios.create(
    {
        baseURL: `http://127.0.0.1:${serverPort}/services`,
        timeout: 1000,
        headers: {
            "Content-Type": "application/json",
            'Authorization': `Bearer ${adminKey}`
        },
    }
)

const entityApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/services`,
    timeout: 1000,
    headers: { 'Content-Type': 'application/json' }
});

const providerApiAdmin = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/provider`,
    timeout: 1000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`
    }
});

const providerApi = axios.create({
    baseURL: `http://127.0.0.1:${serverPort}/provider`,
    timeout: 1000,
    headers: { 'Content-Type': 'application/json' }
});

function base64UrlEncode(...parts: any[]): string {
    function base64UrlEncodePart(data: any): string {
        return Buffer.from(JSON.stringify(data))
            .toString('base64')
            .replace('+', '-')
            .replace('/', '_')
            .replace(/=+$/, '');
    }
    return parts.map(x => base64UrlEncodePart(x)).join('.');
}

describe("Entity API auth tests", () => {
    const oauth2ServerHost = '127.0.0.1';
    const oauth2ServerPort = 9002;
    const procedureCallbackHostname = "127.0.0.1";
    const procedureCallbackPort = 9001;
    const provider: Provider = new ProviderBuilder()
        .withVersion("0.1.0")
        .withKinds()
        .withCallback(`http://${procedureCallbackHostname}:${procedureCallbackPort}`)
        .withEntityProcedures()
        .withKindProcedures()
        .withProviderProcedures()
        .withOAuth2Description()
        .withAuthModel()
        .build();
    const kind_name = provider.kinds[0].name;
    let entity_metadata: Metadata, entity_spec: Spec;
    let idp_token: string;
    const entityApiAuthTestLogger = LoggerFactory.makeLogger({level: 'info'});

    const tenant_uuid = uuid();
    const oauth2Server = http.createServer((req, res) => {
        if (req.method == 'GET') {
            const params = queryString.parse(url.parse(req.url).query);
            if (!params.redirect_uri) {
                res.statusCode = 401
                res.end(JSON.stringify({
                    redirected: true
                }))
                return
            }
            expect(params.client_id).toEqual('XXX');
            expect(params.scope).toEqual('openid');
            expect(params.response_type).toEqual('code');
            // expect(params.prompt).toEqual('login');
            const resp_query = queryString.stringify({
                state: params.state,
                code: 'ZZZ'
            });
            res.statusCode = 302;
            res.setHeader('Location', params.redirect_uri + '?' + resp_query);
            res.end();
        } else if (req.method == 'POST') {
            let body = '';
            req.on('data', function (data) {
                body += data;
            });
            req.on('end', function () {
                const params = queryString.parse(body);
                expect(params.client_id).toEqual('XXX');
                expect(params.client_secret).toEqual('YYY');
                expect(params.code).toEqual('ZZZ');
                expect(params.grant_type).toEqual('authorization_code');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                let timestampDate = new Date().getTime()
                const timestamp = timestampDate / 1000
                const expirationDate = new Date(timestampDate)
                expirationDate.setHours(expirationDate.getHours() + 2)
                const expiration = expirationDate.getTime() / 1000
                const access_token = base64UrlEncode({
                        "alg": "RS256"
                    },
                    {
                        "created_by": "papiea",
                        "azp": "EEE",
                        "sub": "alice",
                        "default_tenant": tenant_uuid,
                        "iss": "https:\/\/127.0.0.1:9002\/oauth2\/token",
                        "given_name": "Alice",
                        "iat": timestamp,
                        "exp": expiration,
                        "email": "alice@localhost",
                        "last_name": "Doe",
                        "aud": ["EEE"],
                        "role": "COMMUNITY,Internal\/everyone",
                        "jti": uuid(),
                        "user_id": uuid()
                    });
                const id_token = base64UrlEncode(
                        {
                            "alg": "RS256",
                            "x5t": "AAA",
                            "kid": "BBB"
                        }, {
                            "azp": "EEE",
                            "sub": "alice",
                            "at_hash": "DDD",
                            "default_tenant": tenant_uuid,
                            "iss": "https:\/\/127.0.0.1:9002\/oauth2\/token",
                            "given_name": "Alice",
                            "iat": 1555926264,
                            "xi_role": base64UrlEncode([{
                                "tenant-domain": tenant_uuid,
                                "tenant-status": "PROVISIONED",
                                "tenant-name": "someTenant",
                                "roles": [{ "name": "account-admin" }, { "name": "papiea-admin" }],
                                "tenant-owner-email": "someTenant@localhost",
                                "account_approved": true,
                                "tenant-properties": {
                                    "sfdc-accountid": "xyztest",
                                    "tenant-uuid": tenant_uuid
                                }
                            }]),
                            "auth_time": timestamp,
                            "exp": expiration,
                            "email": "alice@localhost",
                            "aud": ["EEE"],
                            "last_name": "Doe",
                            "role": ["COMMUNITY", "Internal\/everyone"],
                            "federated_idp": "local"
                        });
                idp_token = JSON.stringify({
                    scope: 'openid',
                    token_type: 'Bearer',
                    expires_in: expiration - timestamp,
                    refresh_token: uuid(),
                    id_token: id_token,
                    access_token: access_token,
                });
                res.end(idp_token);
            });
        }
    });
    const expectAssertionsFromOauth2Server = 7;

    beforeAll(async () => {
        await providerApiAdmin.post('/', provider);
        oauth2Server.listen(oauth2ServerPort, oauth2ServerHost, () => {
            entityApiAuthTestLogger.info(`Server running at http://${oauth2ServerHost}:${oauth2ServerPort}/`);
        });
    });

    afterAll(async () => {
        await providerApiAdmin.delete(`/${provider.prefix}/${provider.version}`);
        oauth2Server.close();
    });

    beforeEach(async () => {
        await providerApiAdmin.post(`/${provider.prefix}/${provider.version}/auth`, {
            policy: null
        });
        const { data: { metadata, spec } } = await entityApi.post(`/${provider.prefix}/${provider.version}/${kind_name}`, {
            metadata: {
                extension: {
                    owner: "alice",
                    tenant_uuid: tenant_uuid
                }
            },
            spec: {
                x: 10,
                y: 11
            }
        });
        entity_metadata = metadata;
        entity_spec = spec;
    });

    afterEach(async () => {
        await providerApiAdmin.post(`/${provider.prefix}/${provider.version}/auth`, {
            policy: null
        });
        await entityApiAdmin.delete(`/${provider.prefix}/${provider.version}/${kind_name}/${entity_metadata.uuid}`);
    });

    test("Get user info", async () => {
        expect.hasAssertions();
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`);
        const { data } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
                                               { headers: { 'Authorization': 'Bearer ' + token } }
        );
        expect(data.owner).toEqual("alice");
        expect(data.tenant).toEqual(tenant_uuid);
    });

    test("Get user info via cookie", async () => {
        expect.hasAssertions();
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`);
        const { data } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
            { headers: { 'Cookie': 'token=' + token } }
        );
        expect(data.owner).toEqual("alice");
        expect(data.tenant).toEqual(tenant_uuid);
    });

    test("Login from SPA", async () => {
        expect.hasAssertions();
        const hostname = "127.0.0.1";
        const port = 9003;
        const server = http.createServer((req, res) => {
            if (req.method == 'GET') {
                const token = queryString.parse(url.parse(req.url).query).token;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ token }));
                server.close();
            }
        });
        server.listen(port, hostname, () => {
            entityApiAuthTestLogger.info(`Server running at http://${ hostname }:${ port }/`);
        });
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login?redirect_uri=http://${ hostname }:${ port }/`);
        const { data } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
        expect(data.owner).toEqual("alice");
        expect(data.tenant).toEqual(tenant_uuid);
    });

    test("Get entity should raise permission denied", async () => {
        expect.assertions(1 + expectAssertionsFromOauth2Server);
        try {
            const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
            await providerApiAdmin.post(`/${provider.prefix}/${provider.version}/auth`, {
                policy: `p, bill, owner, ${kind_name}, *, allow`
            });
            await entityApi.get(`/${provider.prefix}/${provider.version}/${kind_name}/${entity_metadata.uuid}`,
                { headers: { 'Authorization': 'Bearer ' + token } }
            );
        } catch (e) {
            expect(e.response.status).toEqual(403);
        }
    });

    test("Get entity should succeed after policy set", async () => {
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`);
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        const { data: { metadata, spec } } = await entityApi.get(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ entity_metadata.uuid }`,
                                                                 { headers: { 'Authorization': 'Bearer ' + token } }
        );
        expect(metadata).toEqual(entity_metadata);
        expect(spec).toEqual(entity_spec);
    });

    test("Update entity should raise permission denied", async () => {
        expect.assertions(1 + expectAssertionsFromOauth2Server);
        try {
            const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
            await providerApiAdmin.post(`/${provider.prefix}/${provider.version}/auth`, {
                policy: `p, bill, owner, ${kind_name}, *, allow`
            });
            await entityApi.put(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ entity_metadata.uuid }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    spec_version: 1
                }
            }, {
                                    headers: { 'Authorization': 'Bearer ' + token }
                                });
        } catch (e) {
            expect(e.response.status).toEqual(403);
        }
    });

    test("Update entity should succeed after policy set", async () => {
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`);
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        await entityApi.put(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ entity_metadata.uuid }`, {
            spec: {
                x: 101,
                y: 11
            },
            metadata: {
                spec_version: 1
            }
        }, {
                                headers: { 'Authorization': 'Bearer ' + token }
                            });
        const { data: {metadata, spec } } = await entityApi.get(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ entity_metadata.uuid }`, {
            headers: { 'Authorization': 'Bearer ' + token }
        })
        entity_spec.x = 101;
        entity_metadata.spec_version = 2;
        expect(metadata).toEqual(entity_metadata);
        expect(spec).toEqual(entity_spec);
    });

    test("Fake owner should raise permission denied", async () => {
        const { data: { metadata, spec } } = await entityApi.post(`/${provider.prefix}/${provider.version}/${kind_name}`, {
            metadata: {
                extension: {
                    owner: "bill",
                    tenant_uuid: tenant_uuid
                }
            },
            spec: {
                x: 10,
                y: 11
            }
        });
        expect.assertions(1 + expectAssertionsFromOauth2Server);
        try {
            const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
            await providerApiAdmin.post(`/${provider.prefix}/${provider.version}/auth`, {
                policy: `p, bill, owner, ${kind_name}, *, allow`
            });
            await entityApi.put(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ metadata.uuid }`, {
                spec: {
                    x: 10,
                    y: 11
                },
                metadata: {
                    spec_version: 1,
                    extension: {
                        owner: "alice"
                    }
                }
            }, {
                                    headers: { 'Authorization': 'Bearer ' + token }
                                });
        } catch (e) {
            expect(e.response.status).toEqual(403);
        }
    });

    test("Entity procedure should receive headers", async () => {
        let headers: any = {};
        const server = http.createServer((req, res) => {
            if (req.method == 'POST') {
                Object.assign(headers, req.headers);
                let body = '';
                req.on('data', function (data) {
                    body += data;
                });
                req.on('end', function () {
                    const post = JSON.parse(body);
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(JSON.stringify(post.spec));
                    server.close();
                });
            }
        });
        server.listen(procedureCallbackPort, procedureCallbackHostname, () => {
            entityApiAuthTestLogger.info(`Server running at http://${ procedureCallbackHostname }:${ procedureCallbackPort }/`);
        });
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`);
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        await entityApi.post(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ entity_metadata.uuid }/procedure/moveX`, { x: 5 },
                             { headers: { 'Authorization': 'Bearer ' + token } }
        );
        expect(headers['tenant']).toEqual(tenant_uuid);
        expect(headers['tenant-email']).toEqual('alice@localhost');
        expect(headers['tenant-fname']).toEqual('Alice');
        expect(headers['tenant-lname']).toEqual('Doe');
        expect(headers['tenant-role']).toEqual('papiea-admin');
        expect(headers['owner']).toEqual('alice');
        expect(headers['authorization']).toBeDefined();
    });

    test("Create, get and inacivate s2s key", async () => {
        expect.hasAssertions();
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`);
        const { data: user_info } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
        const { data: s2skey } = await providerApi.post(`/${ provider.prefix }/${ provider.version }/s2skey`,
            {
                owner: user_info.owner
            },
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
        const { data: s2skeys } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/s2skey`,
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
        expect(s2skeys.length).toEqual(1);
        expect(s2skeys[0].key).toEqual(s2skey.key.slice(0, 2) + "*****" + s2skey.key.slice(-2));
        const { data } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
            { headers: { 'Authorization': 'Bearer ' + s2skey.key } }
        );
        expect(data.owner).toEqual("alice");
        expect(data.tenant).toEqual(tenant_uuid);
        expect(data.provider_prefix).toEqual(provider.prefix);
        await providerApi.put(`/${ provider.prefix }/${ provider.version }/s2skey`,
            {
                uuid: s2skey.uuid,
                active: false
            },
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
        try {
            await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
                { headers: { 'Authorization': 'Bearer ' + s2skey.key } }
            );
            throw new Error("Key hasn't been inactivated");
        } catch (e) {
            expect(e.response.status).toEqual(401);
        }
    });

    test("Get entity with s2skey should succeed", async () => {
        expect.hasAssertions();
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`);
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        const { data: user_info } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
        const { data: s2skey } = await providerApi.post(`/${ provider.prefix }/${ provider.version }/s2skey`,
            {
                owner: user_info.owner
            },
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
        const { data: { metadata, spec } } = await entityApi.get(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ entity_metadata.uuid }`,
            { headers: { 'Authorization': 'Bearer ' + s2skey.key } }
        );
        expect(metadata).toEqual(entity_metadata);
        expect(spec).toEqual(entity_spec);
    });

    test("Entity procedure should receive authorization header through s2s key", async () => {
        let headers: any = {};
        const server = http.createServer((req, res) => {
            if (req.method == 'POST') {
                Object.assign(headers, req.headers);
                let body = '';
                req.on('data', function (data) {
                    body += data;
                });
                req.on('end', function () {
                    const post = JSON.parse(body);
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(JSON.stringify(post.spec));
                    server.close();
                });
            }
        });
        server.listen(procedureCallbackPort, procedureCallbackHostname, () => {
            entityApiAuthTestLogger.info(`Server running at http://${ procedureCallbackHostname }:${ procedureCallbackPort }/`);
        });
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`);
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        const { data: user_info } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
        const { data: s2skey } = await providerApi.post(`/${ provider.prefix }/${ provider.version }/s2skey`,
            {
                owner: user_info.owner
            },
            { headers: { 'Authorization': 'Bearer ' + token } }
        );

        await entityApi.post(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ entity_metadata.uuid }/procedure/moveX`, { x: 5 },
            { headers: { 'Authorization': 'Bearer ' + s2skey.key } }
        );
        expect(headers['authorization']).toBe(`Bearer ${s2skey.key}`);
    });

    test("Create s2s key with another owner should fail", async () => {
        expect.assertions(1 + expectAssertionsFromOauth2Server);
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`);
        const { data: user_info } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
        try {
            await providerApi.post(`/${ provider.prefix }/${ provider.version }/s2skey`,
                {
                    owner: "another_owner"
                },
                { headers: { 'Authorization': 'Bearer ' + token } }
            );
        } catch (e) {
            expect(e.response.status).toEqual(403);
        }
    });

    test("Call entity procedure without permission should fail", async () => {
        const server = http.createServer((req, res) => {
            if (req.method == 'POST') {
                let body = '';
                req.on('data', function (data) {
                    body += data;
                });
                req.on('end', function () {
                    // Some operation which causes forbidden
                    res.statusCode = 403;
                    res.end();
                    server.close();
                });
            }
        });
        server.listen(procedureCallbackPort, procedureCallbackHostname, () => {
            entityApiAuthTestLogger.info(`Server running at http://${ procedureCallbackHostname }:${ procedureCallbackPort }/`);
        });
        try {
            const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
            await providerApiAdmin.post(`/${provider.prefix}/${provider.version}/auth`, {
                policy: `p, alice, owner, ${kind_name}, read, allow`
            });
            await entityApi.post(`/${provider.prefix}/${provider.version}/${kind_name}/${entity_metadata.uuid}/procedure/moveX`, { x: 5 },
                { headers: { 'Authorization': 'Bearer ' + token } }
            );
            throw new Error("Call procedure without permission should fail");
        } catch (e) {
            expect(e.response.status).toEqual(403);
        }
    });

    test("Call entity procedure with permission should succeed", async () => {
        const server = http.createServer((req, res) => {
            if (req.method == 'POST') {
                let body = '';
                req.on('data', function (data) {
                    body += data;
                });
                req.on('end', function () {
                    const post = JSON.parse(body);
                    const authorization = req.headers['authorization'];
                    entityApi.get(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ post.metadata.uuid }`,
                        { headers: { 'Authorization': authorization } }
                    ).then(response => {
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'text/plain');
                        res.end(JSON.stringify(response.data.spec));
                        server.close();
                    }).catch(err => {
                        res.statusCode = err.response.status;
                        res.end();
                        server.close();
                    });
                });
            }
        });
        server.listen(procedureCallbackPort, procedureCallbackHostname, () => {
            entityApiAuthTestLogger.info(`Server running at http://${ procedureCallbackHostname }:${ procedureCallbackPort }/`);
        });
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`);
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, read, allow`
        });
        await entityApi.post(`/${ provider.prefix }/${ provider.version }/${ kind_name }/${ entity_metadata.uuid }/procedure/moveX`, { x: 5 },
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
    });

    test("Call kind procedure by provider-user should succeed", async () => {
        const server = http.createServer((req, res) => {
            if (req.method == 'POST') {
                let body = '';
                req.on('data', function (data) {
                    body += data;
                });
                req.on('end', function () {
                    const post = JSON.parse(body);
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(JSON.stringify(post.input));
                    server.close();
                });
            }
        });
        server.listen(procedureCallbackPort, procedureCallbackHostname, () => {
            entityApiAuthTestLogger.info(`Server running at http://${ procedureCallbackHostname }:${ procedureCallbackPort }/`);
        });
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        await providerApiAdmin.post(`/${provider.prefix}/${provider.version}/auth`, {
            policy: `p, alice, owner, ${kind_name}, *, allow`
        });
        await entityApi.post(`/${provider.prefix}/${provider.version}/${kind_name}/procedure/computeGeolocation`, { region_id: "5" },
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
    });

    test("Call kind procedure by provider-admin should succeed", async () => {
        const server = http.createServer((req, res) => {
            if (req.method == 'POST') {
                let body = '';
                req.on('data', function (data) {
                    body += data;
                });
                req.on('end', function () {
                    const post = JSON.parse(body);
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(JSON.stringify(post.input));
                    server.close();
                });
            }
        });
        server.listen(procedureCallbackPort, procedureCallbackHostname, () => {
            entityApiAuthTestLogger.info(`Server running at http://${ procedureCallbackHostname }:${ procedureCallbackPort }/`);
        });
        // There should be some policy in place
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        const { data: s2skey } = await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/s2skey`,
            {
                user_info: {
                    is_provider_admin: true
                }
            }
        );
        await entityApi.post(`/${ provider.prefix }/${ provider.version }/${ kind_name }/procedure/computeGeolocation`, { region_id: "2" },
            { headers: { 'Authorization': 'Bearer ' + s2skey.key } }
        );
    });

    test("Call provider procedure by provider-user should succeed", async () => {
        const server = http.createServer((req, res) => {
            if (req.method == 'POST') {
                let body = '';
                req.on('data', function (data) {
                    body += data;
                });
                req.on('end', function () {
                    const post = JSON.parse(body);
                    const sum = post.input.a + post.input.b;
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(JSON.stringify(sum));
                    server.close();
                });
            }
        });
        server.listen(procedureCallbackPort, procedureCallbackHostname, () => {
            entityApiAuthTestLogger.info(`Server running at http://${ procedureCallbackHostname }:${ procedureCallbackPort }/`);
        });
        const { data: { token } } = await providerApi.get(`/${provider.prefix}/${provider.version}/auth/login`);
        await providerApiAdmin.post(`/${provider.prefix}/${provider.version}/auth`, {
            policy: `p, alice, owner, ${kind_name}, *, allow`
        });
        await entityApi.post(`/${ provider.prefix }/${ provider.version }/procedure/computeSum`, {
            "a": 5,
            "b": 5
        },
            { headers: { 'Authorization': 'Bearer ' + token } }
        );
    });

    test("Call provider procedure by provider-admin should succeed", async () => {
        const server = http.createServer((req, res) => {
            if (req.method == 'POST') {
                let body = '';
                req.on('data', function (data) {
                    body += data;
                });
                req.on('end', function () {
                    const post = JSON.parse(body);
                    const sum = post.input.a + post.input.b;
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(JSON.stringify(sum));
                    server.close();
                });
            }
        });
        server.listen(procedureCallbackPort, procedureCallbackHostname, () => {
            entityApiAuthTestLogger.info(`Server running at http://${ procedureCallbackHostname }:${ procedureCallbackPort }/`);
        });
        // There should be some policy in place
        await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/auth`, {
            policy: `p, alice, owner, ${ kind_name }, *, allow`
        });
        const { data: s2skey } = await providerApiAdmin.post(`/${ provider.prefix }/${ provider.version }/s2skey`,
            {
                user_info: {
                    is_provider_admin: true
                }
            }
        );
        await entityApi.post(`/${ provider.prefix }/${ provider.version }/procedure/computeSum`, {
                "a": 5,
                "b": 5
            },
            { headers: { 'Authorization': 'Bearer ' + s2skey.key } }
        );
    });

    test("Call kind procedure by provider-admin of different provider should fail", async () => {
        expect.hasAssertions();
        try {
            // There should be some policy in place
            await providerApiAdmin.post(`/${provider.prefix}/${provider.version}/auth`, {
                policy: `p, alice, owner, ${kind_name}, *, allow`
            });
            const { data: s2skey } = await providerApiAdmin.post(`/${provider.prefix + "1"}/${provider.version}/s2skey`,
                {
                    user_info: {
                        is_provider_admin: true
                    }
                }
            );
            await entityApi.post(`/${provider.prefix}/${provider.version}/${kind_name}/procedure/computeGeolocation`, { region_id: "5" },
                { headers: { 'Authorization': 'Bearer ' + s2skey.key } }
            );
            throw new Error("Call procedure without permission should fail");
        } catch (e) {
            // Unauthorized bacause provider-admin is authorized against different provider
            expect(e.response.status).toEqual(401);
        }
    });
});


describe("Entity API Logout tests", () => {
    const oauth2ServerHost = '127.0.0.1';
    const oauth2ServerPort = 9002;
    const procedureCallbackHostname = "127.0.0.1";
    const procedureCallbackPort = 9001;
    const provider: Provider = new ProviderBuilder()
        .withVersion("0.1.0")
        .withKinds()
        .withCallback(`http://${procedureCallbackHostname}:${procedureCallbackPort}`)
        .withEntityProcedures()
        .withKindProcedures()
        .withProviderProcedures()
        .withOAuth2Description()
        .withAuthModel()
        .build();
    const oauth2Server = OAuth2Server.createServer();
    const entityApiAuthTestLogger = LoggerFactory.makeLogger({level: 'info'});

    beforeAll(async () => {
        await providerApiAdmin.post('/', provider);
        oauth2Server.httpServer.listen(oauth2ServerPort, oauth2ServerHost, () => {
            entityApiAuthTestLogger.info(`Server running at http://${oauth2ServerHost}:${oauth2ServerPort}/`);
        });
    });

    afterAll(async () => {
        await providerApiAdmin.delete(`/${provider.prefix}/${provider.version}`);
        oauth2Server.httpServer.close();
    });

    test("User can logout", async () => {
        expect.hasAssertions()
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`)
        const { data } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
            { headers: { 'Authorization': 'Bearer ' + token } }
        )
        const result = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/logout`,
            { headers: { 'Authorization': 'Bearer ' + token } }
        )
        expect(result.data.logout_uri).toBe(`${provider.oauth2.oauth.auth_host}${provider.oauth2.oauth.logout_uri}`)
    })
})


describe("Entity API Refresh token tests", () => {
    const oauth2ServerHost = '127.0.0.1';
    const oauth2ServerPort = 9002;
    const procedureCallbackHostname = "127.0.0.1";
    const procedureCallbackPort = 9001;
    const provider: Provider = new ProviderBuilder()
        .withVersion("0.1.0")
        .withKinds()
        .withCallback(`http://${procedureCallbackHostname}:${procedureCallbackPort}`)
        .withEntityProcedures()
        .withKindProcedures()
        .withProviderProcedures()
        .withOAuth2Description()
        .withAuthModel()
        .build();
    const oauth2Server = OAuth2Server.createServer(-5);
    const entityApiAuthTestLogger = LoggerFactory.makeLogger({level: 'info'});

    beforeAll(async () => {
        await providerApiAdmin.post('/', provider);
        oauth2Server.httpServer.listen(oauth2ServerPort, oauth2ServerHost, () => {
            entityApiAuthTestLogger.info(`Server running at http://${oauth2ServerHost}:${oauth2ServerPort}/`);
        });
    });

    afterAll(async () => {
        await providerApiAdmin.delete(`/${provider.prefix}/${provider.version}`);
        oauth2Server.httpServer.close();
    });

    test("Silent token refresh", async () => {
        expect.hasAssertions()
        const { data: { token } } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/login`)
        const { data } = await providerApi.get(`/${ provider.prefix }/${ provider.version }/auth/user_info`,
            { headers: { 'Authorization': 'Bearer ' + token } }
        )
        expect(data).toBeDefined()
    })
})
