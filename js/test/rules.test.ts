// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allOf,
  allOrNone,
  anyOf,
  atLeastOneOf,
  defineRules,
  exactlyOneOf,
  fieldRefs,
  not,
  ValidonceDefinitionError,
  when,
} from "../src/rules";
import { signupFields, signupRules } from "./fixtures/signup";

const F = fieldRefs("a", "b", "c", "nope", "zzz");

const golden = JSON.parse(
  readFileSync(
    new URL("../../conformance/golden/fastapi.openapi.json", import.meta.url),
    "utf8",
  ),
) as { components: { schemas: { Signup: { "x-validonce": unknown } } } };

describe("defineRules", () => {
  it("emits the same Signup rules as the Python builders", () => {
    expect(signupRules).toEqual(
      golden.components.schemas.Signup["x-validonce"],
    );
  });

  it("emits group rules and combined conditions", () => {
    const rs = defineRules(
      "T",
      [
        atLeastOneOf(F.a, F.b, { key: "k1" }),
        exactlyOneOf("a", "b", { key: "k2", path: F.b, server_only: true }),
        allOrNone(F.a, F.b, { key: "k3", id: "custom" }),
        when(allOf(F.a.isIn(["x", "y"]), not(F.b.present()))).require(F.c, {
          key: "k4",
        }),
        when(anyOf(F.a.ne(1), F.b.absent())).require(F.c, {
          key: "k5",
          id: "T.x",
        }),
      ],
      { fields: ["a", "b", "c"] },
    );
    expect(rs.rules.map((r) => r.id)).toEqual([
      "T.at_least_one_of.a",
      "T.exactly_one_of.b",
      "custom",
      "T.required_when.c",
      "T.x",
    ]);
    expect(rs.rules[1]).toMatchObject({ path: "b", server_only: true });
  });

  it("fails on an unknown field when fields are given", () => {
    expect(() =>
      defineRules("T", [atLeastOneOf(F.a, F.nope, { key: "k" })], {
        fields: ["a", "b"],
      }),
    ).toThrow(/unknown field "nope"/);
    expect(() =>
      defineRules("T", [when(F.zzz.eq("x")).require(F.a, { key: "k" })], {
        fields: ["a"],
      }),
    ).toThrow(ValidonceDefinitionError);
    expect(() =>
      defineRules("T", [atLeastOneOf(F.a, F.b, { key: "k", path: "q" })], {
        fields: ["a", "b"],
      }),
    ).toThrow(/unknown field "q"/);
  });

  it("fails on a duplicate id", () => {
    expect(() =>
      defineRules("T", [
        atLeastOneOf(F.a, F.b, { key: "k" }),
        atLeastOneOf(F.a, F.c, { key: "k" }),
      ]),
    ).toThrow(/duplicate rule id "T.at_least_one_of.a"/);
  });

  it("fails on an unsupported or missing compare type", () => {
    expect(() =>
      defineRules("T", [F.a.ge(1, { key: "k", type: "money" as never })]),
    ).toThrow(/unsupported compare type "money"/);
    expect(() => defineRules("T", [F.a.ge(1, { key: "k" })])).toThrow(
      /cannot tell the compare type/,
    );
    expect(() =>
      defineRules("T", [F.a.ge("2026-01-01", { key: "k", type: "number" })]),
    ).toThrow(/does not match compare type number/);
    expect(() =>
      defineRules("T", [F.a.ge("01/02/2026", { key: "k", type: "date" })]),
    ).toThrow(/does not match compare type date/);
    expect(() =>
      defineRules("T", [F.a.ge(F.b, { key: "k" })], {
        fields: { a: "number", b: "date" },
      }),
    ).toThrow(/cannot compare "a" \(number\) with "b" \(date\)/);
  });

  it("fails on malformed rules", () => {
    expect(() => defineRules("T", [atLeastOneOf(F.a, { key: "k" })])).toThrow(
      /at least two fields/,
    );
    expect(() =>
      defineRules("T", [atLeastOneOf(F.a, F.a, { key: "k" })]),
    ).toThrow(/lists a field twice/);
    expect(() =>
      defineRules("T", [atLeastOneOf(F.a, F.b, { key: "" })]),
    ).toThrow(/message key is required/);
    expect(() => defineRules("T", [{} as never])).toThrow(/builders/);
    expect(() => F.a.isIn([])).toThrow(/at least one value/);
    expect(() => F.a.ge(true as never, { key: "k", type: "number" })).toThrow(
      ValidonceDefinitionError,
    );
    expect(() =>
      atLeastOneOf(F.a, F.b, { key: "k", params: { x: {} as never } }),
    ).not.toThrow();
    expect(() =>
      defineRules("T", [
        atLeastOneOf(F.a, F.b, { key: "k", params: { x: {} as never } }),
      ]),
    ).toThrow(/param "x"/);
  });

  it("is plain JSON", () => {
    expect(JSON.parse(JSON.stringify(signupRules))).toEqual(signupRules);
    expect(signupFields).toContain("plan");
  });
});
