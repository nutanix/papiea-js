import "jest"
import { ValidatorImpl } from "../../src/validator";
import { DescriptionBuilder, KindBuilder, ValidationBuilder } from "../test_data_factory"
import { IntentfulBehaviour, SpecOnlyEntityKind } from "papiea-core"
import uuid = require("uuid");

describe("Validation tests", () => {

    const locationDataDescription = new DescriptionBuilder().withField("z").build();
    const trimmedLocationDataDescription = Object.assign({}, locationDataDescription);
    const maybeLocation = Object.values(locationDataDescription)[0];
    const validator = ValidatorImpl.create()

    test("Basic validation should succeed", (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocation, trimmedLocationDataDescription, false, "trimmedLocation")
        })
    });

    test("Missing required parameter 'x'", (done) => {
        const entity = {
            spec: {
                y: 11
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocation, trimmedLocationDataDescription, false, "trimmedLocation")
        }, true)
    });

    test("Additional expected parameter 'z'", (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                z: 20
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocation, trimmedLocationDataDescription, false, "trimmedLocation")
        })
    });

    test("Additional unexpected parameter 'k'", (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                k: 20
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocation, trimmedLocationDataDescription, false, "trimmedLocation")
        }, true)
    });

    test("Parameter x with wrong type string", (done) => {
        const entity = {
            spec: {
                x: "Totally not an integer",
                y: 11,
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocation, trimmedLocationDataDescription, false, "trimmedLocation")
        }, true)
    });

    test("Additional Nested parameter", (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                v: {
                    d: 10
                }
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocation, trimmedLocationDataDescription, false, "trimmedLocation")
        })
    });

    test("Additional Nested parameter with wrong type", (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                v: {
                    d: "Totally not a number"
                }
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocation, trimmedLocationDataDescription, false, "trimmedLocation")
        }, true)
    });

    test("Additional Nested parameter with wrong type", (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                v: {
                    d: "Totally not a number"
                }
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocation, trimmedLocationDataDescription, false, "trimmedLocation")
        }, true)
    });

    let locationDataDescriptionStringParam = new DescriptionBuilder().withField("h", {"type": "string"}).build();
    const trimmedLocationDataDescriptionStringParam = Object.assign({}, locationDataDescription);
    const maybeLocationStringParam = Object.values(locationDataDescriptionStringParam)[0];

    test("Basic validation with string param should succeed", (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                h: "String"
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocationStringParam, trimmedLocationDataDescriptionStringParam, false, "trimmedLocation")
        })
    });

    test("Parameter x with wrong type number", (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                h: 12
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocationStringParam, trimmedLocationDataDescriptionStringParam, false, "trimmedLocation")
        }, true)
    });

    test("Required parameter x with empty string", (done) => {
        const entity = {
            spec: {
                x: 10,
                y: 11,
                h: ""
            }
        };
        const try_validate = ValidationBuilder.createSimpleValidationFunc(done);
        try_validate(() => {
            validator.validate('prefix', 'version', 'Location', entity.spec, maybeLocationStringParam, trimmedLocationDataDescriptionStringParam, false, "trimmedLocation")
        })
    });

    const kind = new KindBuilder(IntentfulBehaviour.SpecOnly).build()
    const kind_with_pattern: SpecOnlyEntityKind = JSON.parse(JSON.stringify(kind))
    kind_with_pattern.uuid_validation_pattern = "^a$"

    test("Validator validate uuid when pattern is not specified", async () => {
        expect.assertions(1)
        const id = uuid()
        expect(() => {
            validator.validate_uuid('prefix', 'version', kind, id)
        }).not.toThrow()
    });

    test("Validator doesn't validate uuid when pattern is specified", async () => {
        expect.assertions(1)
        const id = uuid()
        expect(() => {
            validator.validate_uuid('prefix', 'version', kind_with_pattern, id)
        }).toThrow()
    });

    test("Validator validate uuid when pattern is specified", async () => {
        expect.assertions(1)
        const id = "a"
        expect(() => {
            validator.validate_uuid('prefix', 'version', kind_with_pattern, id)
        }).not.toThrow()
    });

    test("Validator doesn't validate uuid when pattern is specified and uuid is incorrect", async () => {
        expect.assertions(1)
        const id = "b"
        expect(() => {
            validator.validate_uuid('prefix', 'version', kind_with_pattern, id)
        }).toThrow()
    });

    test("Validator validate incorrect spec only kind structure with x-papiea=spec-only", () => {
        const desc = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.SpecOnly).withSpecOnlyField().build()
        expect(() => validator.validate_kind_structure(desc, '', '',  Object.keys(desc)[0])).toThrow()
    })

    test("Validator validate incorrect spec only kind structure with x-papiea=status-only", () => {
        const desc = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.SpecOnly).withStatusOnlyField().build()
        expect(()=>validator.validate_kind_structure(desc, '', '',  Object.keys(desc)[0])).toThrow()
    })

    test("Validator validate correct spec only kind structure", () => {
        const desc = new DescriptionBuilder().withBehaviour(IntentfulBehaviour.SpecOnly).build()
        validator.validate_kind_structure(desc, '', '',  Object.keys(desc)[0])
    })
});
