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
    // The schema skeleton's date fields use the helpers that match the servers' date range
    // (z.iso.date() allows year 0000).
    const zm = generateCode({ ...base, target: "zod", modelName: "Signup", includeModel: true });
    expect(zm.source).toContain('import { isoDate, withRules } from "validonce/zod";');
    expect(zm.source).toContain("start: isoDate().nullable().optional()");
    expect(zm.source).not.toContain("z.iso.date()");
    expect(z.source).toContain('import { withRules } from "validonce/zod";');
    const rhf = generateCode({ ...base, target: "react-hook-form" });
    expect(rhf.source).toContain("registerDeps<Field>(rules)");
    const ng = generateCode({ ...base, target: "angular-reactive" });
    expect(ng.source).toContain("validonceGroupValidator(rules, { messages })");
    expect(ng.source).toContain('"Signup.compare.end"');
  });

  it("go: struct with json tags, MustBuild rules, Huma note", () => {
    const r = generateCode({ ...base, target: "go" });
    expect(r.complete).toBe(true);
    expect(r.source).toContain("package models");
    expect(r.source).toContain("type Signup struct {");
    expect(r.source).toContain('`json:"company,omitempty"`');
    expect(r.source).toContain('`json:"start,omitempty" format:"date"`');
    expect(r.source).toContain('validonce.When(validonce.Eq("plan", "pro")).Require("company", validonce.Key("rules.company_required"))');
    expect(r.source).toContain('validonce.Cmp("end").Ge(validonce.Ref("start"), validonce.Key("rules.end_after_start"))');
    expect(r.source).toContain('validonce.Params(map[string]any{"min": 1})');
    expect(r.source).toContain("var SignupRules = validonce.MustBuild[Signup](");
    expect(r.notes.join(" ")).toContain("humaonce.Transform(SignupRules, s)");
    expect(r.names).toMatchObject({ company: "Company" });
  });

  it("go: a wire name Go cannot tag is reported as unexpressible", () => {
    const rules = { version: 1, rules: [{ id: "A.1", kind: "at_least_one_of", fields: ['a"b', "c"], message: { key: "k" } }] };
    const r = generateCode({ rules, target: "go", modelName: "A" });
    expect(r.complete).toBe(false);
    expect(r.unexpressible[0]!.ruleId).toBe("A.1");
    expect(r.source).toContain("// NOT EXPRESSIBLE");
  });

  it("java: record, rules class and files", () => {
    const r = generateCode({ ...base, target: "java", namespace: "app" });
    expect(r.files!.map((f) => f.path)).toEqual(["Signup.java", "SignupRules.java"]);
    expect(r.source).toContain("@ValidonceRules(SignupRules.class)");
    expect(r.source).toContain("public record Signup(");
    expect(r.source).toContain("LocalDate start");
    expect(r.source).toContain("package app;");
    expect(r.source).toContain('.requiredWhen("company", Condition.eq("plan", "pro")).key("rules.company_required")');
    expect(r.source).toContain('.compare("end", Op.GE, "start").key("rules.end_after_start")');
    expect(r.source).toContain('.compareValue("quantity", Op.GE, 1).key("rules.quantity_min").param("min", 1)');
    expect(r.notes.join(" ")).toContain("Kotlin");
  });

  it("java: snake_case wire names get @JsonProperty, ids that differ are written", () => {
    const rules = { version: 1, rules: [{ id: "custom", kind: "at_least_one_of", fields: ["max_qty", "min_qty"], message: { key: "k" } }] };
    const r = generateCode({ rules, target: "java", modelName: "A" });
    expect(r.source).toContain('@JsonProperty("max_qty") String maxQty');
    expect(r.source).toContain('.atLeastOneOf("max_qty", "min_qty").key("k").id("custom")');
  });

  it("typescript-rules: fastify and nestjs", () => {
    const f = generateCode({ ...base, target: "typescript-rules" });
    expect(f.source).toContain('import { withRules } from "validonce/fastify";');
    expect(f.source).toContain('when(F.plan.eq("pro")).require(F.company, { key: "rules.company_required", id: "Signup.required_when.company" })'.replace(', id: "Signup.required_when.company"', ""));
    expect(f.source).toContain('F.end.ge(F.start, { key: "rules.end_after_start", type: "date" })');
    expect(f.source).toContain('{ $id: "Signup" }');
    const n = generateCode({ ...base, target: "typescript-rules", framework: "nestjs" });
    expect(n.source).toContain("@ValidonceRules(rules)");
    expect(n.source).toContain("export class Signup {");
    expect(n.source).toContain("@IsOptional()");
    expect(n.notes.join(" ")).toContain("ValidonceValidationPipe");
  });

  it("vue: composable and single-file component", () => {
    const r = generateCode({ ...base, target: "vue", includeModel: true });
    expect(r.files!.map((f) => f.path)).toEqual(["useSignupForm.ts", "SignupForm.vue"]);
    expect(r.source).toContain("toVeeSchema(schema)");
    expect(r.source).toContain("watchDependents(form, rules);");
    expect(r.source).toContain('import { isoDate, withRules } from "validonce/zod";');
    expect(r.files![1]!.source).toContain('v-model.number="quantity"');
    expect(r.files![1]!.source).toContain("{{ errors.company }}");
  });

  it("dom: attachRules and matching markup", () => {
    const r = generateCode({ ...base, target: "dom" });
    expect(r.source).toContain('attachRules(form, rules, { messages })');
    const html = r.files!.find((f) => f.language === "html")!.source;
    expect(html).toContain('<form id="signup" novalidate>');
    for (const w of ["plan", "company", "start", "end", "quantity"]) {
      expect(html).toContain(`name="${w}"`);
      expect(html).toContain(`data-validonce-error="${w}"`);
    }
    expect(html).toContain('<input type="date" name="start" />');
  });

  it("rejects an invalid rule set", () => {
    expect(() => generateCode({ rules: { version: 2, rules: [] }, target: "csharp" })).toThrow(/Invalid rule set/);
  });
});
