import { Spec, Status, Kind, Differ, Diff, DiffContent } from "papiea-core"
import { Logger } from "papiea-backend-utils";
import { SFSCompiler } from "./sfs_compiler"

export class BasicDiffer implements Differ {
    // Get the diff iterator from an entity based on the
    public* diffs(kind: Kind, spec: Spec, status: Status, logger?: Logger): Generator<Diff, any, undefined> {
        for (let sig of kind.intentful_signatures) {
            const compiled_signature = SFSCompiler.try_compile_sfs(sig.signature, kind.name)
            const result = SFSCompiler.run_sfs(compiled_signature, spec, status, kind.kind_structure[kind.name], kind.name,logger)
            if (result != null && result.length > 0) {
                yield {
                    kind: kind.name,
                    intentful_signature: sig,
                    diff_fields: result as DiffContent[]
                }
            }
        }
    }

    // We could also get the entire list of diffs, ordered by the
    // original dependency tree
    public all_diffs(kind: Kind, spec: Spec, status: Status, logger?: Logger): Diff[] {
        return kind.intentful_signatures.map(sig => {
                const compiled_signature = SFSCompiler.try_compile_sfs(sig.signature, kind.name)
                const diff_fields = SFSCompiler.run_sfs(compiled_signature, spec, status, kind.kind_structure[kind.name], kind.name, logger)
                return {
                    kind: kind.name,
                    intentful_signature: sig,
                    diff_fields: diff_fields as DiffContent[]
                }
            }
        ).filter(diff => diff.diff_fields !== null && diff.diff_fields.length > 0)
    }

    public get_diff_path_value(diff: DiffContent, spec: Spec): any {
        let obj = spec
        for (let item of diff.path) {
            obj = obj[item]
        }
        return obj
    }
}
