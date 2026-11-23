// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateCode } from "../src/codegen";

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(resolve(here, "../../conformance/golden/fastapi.openapi.json"), "utf8"));
const signup = doc.components.schemas.Signup;

const base = { rules: signup["x-validonce"], properties: signup.properties, modelName: "Signup" };

describe("generate_code", () => {
  it("C#: Signup uses the builder API", () => {
    const r = generateCode({ ...base, target: "csharp" });
    expect(r.complete).toBe(true);
    expect(r.source).toContain('RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessageKey("rules.company_required");');
    expect(r.source).toContain("Compare(x => x.End, CompareOp.Ge, x => x.Start)");
    expect(r.source).toContain('new Dictionary<string, object?> { ["min"] = 1 }');
    expect(r.source).toContain("class SignupValidator : ValidonceValidator<Signup>");
  });

  it("C#: writes [JsonPropertyName] when PascalCase would not round-trip, honours propertyNames", () => {
    const rules = { version: 1, rules: [{ id: "A.at_least_one_of.max_qty", kind: "at_least_one_of", fields: ["max_qty", "min_qty"], message: { key: "k" } }] };
    const r = generateCode({ rules, target: "csharp", modelName: "A", propertyNames: { min_qty: "Floor" } });
    expect(r.source).toContain('[JsonPropertyName("max_qty")] public string? MaxQty');
    expect(r.source).toContain('[JsonPropertyName("min_qty")] public string? Floor');
    expect(r.source).toContain("AtLeastOneOf(x => x.MaxQty, x => x.Floor)");
  });

  it("C#: path on required_when and compare becomes .AtPath", () => {
    const rules = {
      version: 1,
      rules: [
        { id: "S.rw", kind: "required_when", field: "b", path: "a", when: { present: { field: "a" } }, message: { key: "k" } },
        { id: "S.cmp", kind: "compare", left: { field: "b" }, op: "gt", right: { value: 3 }, type: "number", path: "a", message: { key: "k" } },
      ],
    };
    const r = generateCode({ rules, target: "csharp", modelName: "S" });
    expect(r.complete).toBe(true);
    expect(r.source).toContain("RequiredWhen(x => x.B, If.Present(x => x.A)).AtPath(x => x.A)");
    expect(r.source).toContain("Compare(x => x.B, CompareOp.Gt, 3).AtPath(x => x.A)");
  });

  it("Python: Signup uses F / when", () => {
    const r = generateCode({ ...base, target: "python" });
    expect(r.source).toContain("class Signup(ValidonceModel):");
    expect(r.source).toContain('when(F.plan == "pro").require(F.company, key="rules.company_required"),');
    expect(r.source).toContain('F.quantity.ge(1, key="rules.quantity_min", params={"min": 1}),');
  });

  it("Python: path, server_only, nested conditions and an alias", () => {
    const rules = {
      version: 1,
      rules: [
        {
          id: "X.1",
          kind: "required_when",
          field: "api-key",
          path: "plan",
          server_only: true,
          when: { all: [{ in: { field: "plan", values: ["a", "b"] } }, { not: { absent: { field: "owner" } } }] },
          message: { key: "k", params: { n: 2, s: "x", t: true, z: null } },
        },
      ],
    };
    const r = generateCode({ rules, target: "python", modelName: "X" });
    expect(r.source).toContain('api_key: str | None = Field(default=None, alias="api-key")');
    expect(r.source).toContain('when(all_of(F.plan.is_in(["a", "b"]), not_(F.owner.absent()))).require(F.api_key');
    expect(r.source).toContain("server_only=True, path=F.plan");
    expect(r.source).toContain('params={"n": 2, "s": "x", "t": True, "z": None}');
  });

  it("clients: zod, react-hook-form, angular", () => {
    const z = generateCode({ ...base, target: "zod", modelName: "Signup" });
    expect(z.source).toContain('withRules(signupBase, rules, { messages })');
    const rhf = generateCode({ ...base, target: "react-hook-form" });
    expect(rhf.source).toContain("registerDeps<Field>(rules)");
    const ng = generateCode({ ...base, target: "angular-reactive" });
    expect(ng.source).toContain("validonceGroupValidator(rules, { messages })");
    expect(ng.source).toContain('"Signup.compare.end"');
  });

  it("rejects an invalid rule set", () => {
    expect(() => generateCode({ rules: { version: 2, rules: [] }, target: "csharp" })).toThrow(/Invalid rule set/);
  });
});
