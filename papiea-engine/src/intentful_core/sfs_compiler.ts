import { ValidationError } from "../errors/validation_error"
import {DiffContent} from "papiea-core"
import { PapieaException } from "../errors/papiea_exception";

// TODO: add d.ts for type annotations
const papi_clj = require("../../papiea-lib-clj/papiea-lib-clj.js").papiea_lib_clj;
const clj_str = (a: any) => papi_clj.core.clj_str(a);
const sfs_parser = (sfs_ast: string) => papi_clj.core.parse_sfs(sfs_ast);
const sfs_optimizer = (sfs_ast: string) => papi_clj.core.optimize_sfs_ast(sfs_ast);
const sfs_compiler = (sfs_signature: string) => papi_clj.core.compile_sfs(sfs_signature);
const run_compiled_sfs = (compiled_sfs: any, spec: any, status: any) =>
    papi_clj.core.run_compiled_sfs(compiled_sfs, spec, status);

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

    static run_sfs(compiled_sfs: any, spec: any, status: any): DiffContent[] | null {
        return run_compiled_sfs(compiled_sfs, spec, status)
    }
}
