import { Request, Response, NextFunction, Router } from "express";
import { serve, generateHTML } from "swagger-ui-express";
import ApiDocsGenerator from "./api_docs_generator";
import { Provider_DB } from "../databases/provider_db_interface";
import { Provider } from "papiea-core";
import { readFileSync } from "fs";
import { resolve } from "path";
import { asyncHandler } from "../auth/authn"

const admin_swagger = readFileSync(resolve(__dirname, 'admin_swagger.json'), 'utf8');

export default function createAPIDocsRouter(urlPrefix: string, apiDocsGenerator: ApiDocsGenerator, providerDb: Provider_DB) {
    const apiDocsRouter = Router();

    apiDocsRouter.use('/', serve);

    apiDocsRouter.get('*/swagger-ui-init.js', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        res.redirect(`${urlPrefix}/swagger-ui-init.js`);
    }))
    
    apiDocsRouter.get('*/swagger-ui-bundle.js', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        res.redirect(`${urlPrefix}/swagger-ui-bundle.js`);
    }));
    
    apiDocsRouter.get('*/swagger-ui-standalone-preset.js', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        res.redirect(`${urlPrefix}/swagger-ui-standalone-preset.js`);
    }));
    
    apiDocsRouter.get('*/swagger-ui.css', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        res.redirect(`${urlPrefix}/swagger-ui.css`);
    }));

    apiDocsRouter.get('/admin', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        res.send(admin_swagger)
    }));

    apiDocsRouter.get('/:provider/:version', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const provider: Provider = await providerDb.get_provider(req.params.provider, req.params.version);
        const apiDocJson: any = await apiDocsGenerator.getApiDocs(provider);
        res.send(JSON.stringify(apiDocJson, null, 4));
    }));

    apiDocsRouter.get('/', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const options: any = {
            explorer: true,
            customCss: '.swagger-ui .url { display: none }',
            swaggerOptions: {
                url: `admin`,
                urls: [
                    {
                        url: `admin`,
                        name: `Admin page`
                    }
                ]
            }
        }
        const providers = await providerDb.list_providers();
        for (let provider of providers) {
            options.swaggerOptions.urls.push({
                name: `${provider.prefix}/${provider.version}`,
                url: `${provider.prefix}/${provider.version}`
            })
        }
        res.send(generateHTML(null, options));
    }));

    return apiDocsRouter;
}
