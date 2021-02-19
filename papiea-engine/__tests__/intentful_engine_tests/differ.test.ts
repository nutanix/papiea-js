import { SFSCompiler } from "../../src/intentful_core/sfs_compiler"
import { DescriptionBuilder, KindBuilder } from "../test_data_factory"
import { IntentfulBehaviour } from "papiea-core"
import { BasicDiffer } from "../../src/intentful_core/differ_impl"
import {
    Intentful_Execution_Strategy,
} from "papiea-core"

describe("Differ tests", () => {

    const locationDataDescription = new DescriptionBuilder().build()
    const intentfulSignature = [{
            signature: "a.{id}.[a,d]",
            name: "test",
            argument: {},
            result: {},
            execution_strategy: Intentful_Execution_Strategy.Basic,
            procedure_callback: "",
            base_callback: ""
        }, {
            signature: "x",
            name: "test",
            argument: {},
            result: {},
            execution_strategy: Intentful_Execution_Strategy.Basic,
            procedure_callback: "",
            base_callback: ""
        }, {
            signature: "y",
            name: "test",
            argument: {},
            result: {},
            execution_strategy: Intentful_Execution_Strategy.Basic,
            procedure_callback: "",
            base_callback: ""
        }]
    const locationDifferKind = new KindBuilder(IntentfulBehaviour.Differ).withDescription(locationDataDescription).withSignatures(intentfulSignature).build()

    test("Differ find single diff", () => {
        expect.assertions(1)
        const differ = new BasicDiffer()
        const spec = {
            "a": [{ "id": 1, "a": 1, "d": 2 },
                { "id": 2, "a": 1, "d": 2 }]
        }
        const status = {
            "a": [{ "id": 1, "a": 2, "d": 3 },
                { "id": 2, "a": 1, "d": 3 }]
        }
        const diff_fields = SFSCompiler.run_sfs(SFSCompiler.try_compile_sfs("a.{id}.[a,d]", "test_kind"), spec, status)
        for (let diff of differ.diffs(locationDifferKind, spec, status)) {
            expect(diff.diff_fields).toEqual(diff_fields)
        }
    })

    // TODO: finish the test when all the bugs are fixed
    // TODO: write more tests for edge cases
    // test.only("Differ find a complex diff with path single diff", () => {
    //     expect.assertions(1)
    //     const differ = new BasicDiffer()
    //     const spec = {
    //         "a": [{ "id": 1, "a": [{ "f": 1, "a": 10, "d": 11}, { "f": 2, "a": 10, "d": 11}], "d": 2 },
    //             { "id": 2, "a": [{ "f": 1, "a": 10, "d": 11}, { "f": 2, "a": 10, "d": 11}], "d": 2 }],
    //         c: {x: 10}
    //     }
    //     const status = {
    //         "a": [{ "id": 1, "a": [{ "f": 1, "a": 12, "d": 13}, { "f": 2, "a": 10, "d": 11}], "d": 3 },
    //             { "id": 2, "a": [{ "f": 1, "a": 10, "d": 11}, { "f": 2, "a": 10, "d": 11}], "d": 3 }],
    //         c: {x: 15}
    //     }
    //     const diff_fields = SFSCompiler.run_sfs(SFSCompiler.try_compile_sfs("a.{id}.a.{f}.[a,d]", "test_kind"), spec, status)
    //     for (let diff of differ.diffs(locationDifferKind, spec, status)) {
    //         console.log(diff_fields)
    //         // expect(diff.diff_fields).toEqual(diff_fields)
    //     }
    // })

    test("Differ produces exception when it cannot parse sfs", () => {
        expect.assertions(1)

        try {
            SFSCompiler.try_compile_sfs("wrong_sfs, wrong_sfs2", "test_kind")
        } catch (e) {
            expect(e.errors[0]).toContain("SFS parsing on kind //test_kind failed with error: Parse error at line 1,")
        }
    })

    test("Differ find 'x' as diff", () => {
        expect.assertions(1)
        const differ = new BasicDiffer()
        const spec = {
            "x": 10,
            "y": 11
        }
        const status = {
            "x": 15,
            "y": 11
        }
        const diff_fields = SFSCompiler.run_sfs(SFSCompiler.try_compile_sfs("x", "test_kind"), spec, status)
        for (let diff of differ.diffs(locationDifferKind, spec, status)) {
            expect(diff.diff_fields).toEqual(diff_fields)
        }
    })

    test("Differ find 'x' and 'y' as diffs", () => {
        expect.assertions(1)
        const differ = new BasicDiffer()
        const spec = {
            "x": 10,
            "y": 12
        }
        const status = {
            "x": 15,
            "y": 20
        }
        let diff_count = 0
        for (let diff of differ.diffs(locationDifferKind, spec, status)) {
            diff_count++
        }
        expect(diff_count).toEqual(2)
    })

    test("Differ find all diffs", () => {
        expect.assertions(1)
        const differ = new BasicDiffer()
        const spec = {
            "x": 10,
            "y": 12
        }
        const status = {
            "x": 15,
            "y": 20
        }
        let diffs = differ.all_diffs(locationDifferKind, spec, status)
        expect(diffs.length).toEqual(2)
    })
})
