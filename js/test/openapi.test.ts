// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { expect, test } from "vitest";
import { ValidonceFormatError } from "../src/index";
import { allRulesFromOpenApi, rulesFromOpenApi } from "../src/openapi";

const rule = {
  id: "A.required_when.b",
  kind: "required_when",
  field: "b",
  when: { present: { field: "a" } },
  message: { key: "k" },
};
const doc = {
  components: {
    schemas: {
      A: { type: "object", "x-validonce": { version: 1, rules: [rule] } },
      Plain: { type: "object" },
    },
  },
};

test("reads one schema's rules", () => {
  expect(rulesFromOpenApi(doc, "A")?.rules).toHaveLength(1);
  expect(rulesFromOpenApi(doc, "Plain")).toBeUndefined();
  expect(rulesFromOpenApi(doc, "Missing")).toBeUndefined();
  expect(rulesFromOpenApi({}, "A")).toBeUndefined();
});

test("reads all rules by schema name", () => {
  expect(Object.keys(allRulesFromOpenApi(doc))).toEqual(["A"]);
});

test("malformed x-validonce throws ValidonceFormatError", () => {
  const bad = {
    components: { schemas: { A: { "x-validonce": { version: 2 } } } },
  };
  expect(() => rulesFromOpenApi(bad, "A")).toThrow(ValidonceFormatError);
  expect(() => allRulesFromOpenApi(bad)).toThrow(/A: unsupported version/);
});

test("falls back to FastAPI's Name-Input schema", () => {
  const split = {
    components: {
      schemas: {
        "Signup-Input": { "x-validonce": { version: 1, rules: [rule] } },
        "Signup-Output": {},
      },
    },
  };
  expect(rulesFromOpenApi(split, "Signup")?.rules).toEqual([rule]);
  expect(rulesFromOpenApi(split, "Missing")).toBeUndefined();
});
