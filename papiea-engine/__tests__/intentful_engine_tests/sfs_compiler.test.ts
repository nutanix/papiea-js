import { SFSCompiler } from "../../src/intentful_core/sfs_compiler"
import { DescriptionBuilder } from "../test_data_factory"

describe("SFS Compiler Tests", () => {
    const locationDataDescription = new DescriptionBuilder().build()
    const name = Object.keys(locationDataDescription)[0]

    test("SFS Compiler compile single signature", () => {
        expect.assertions(1)
        const compiledSignature = SFSCompiler.try_compile_sfs("a.{id}.[a,d]", "test_kind")
        expect(compiledSignature).not.toBeUndefined()
    })

    test("SFS Compiler run sfs", () => {
        expect.assertions(1)
        const compiledSignature = SFSCompiler.try_compile_sfs("a.{id}.[a,d]", "test_kind")
        const diffFields = SFSCompiler.run_sfs(compiledSignature, {
                "a": [{ "id": 1, "a": 1, "d": 2 },
                    { "id": 2, "a": 1, "d": 2 }]
            },
            {
                "a": [{ "id": 1, "a": 2, "d": 3 },
                    { "id": 2, "a": 1, "d": 3 }]
            }, null, "test_kind")
        expect(diffFields).toEqual([{
            keys: { id: 1 },
            key: 'a',
            path: ["a", {"spec": 0, "status": 0}, "a"],
            spec: [1],
            status: [2]
        },
            {
                keys: { id: 1 },
                key: 'd',
                path: ["a", {"spec": 0, "status": 0}, "d"],
                spec: [2],
                status: [3]
            }])
    })
})
