// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, test } from "vitest";
import {
  parseCel,
  ROW_IDS,
  type RowId,
  rulesAt,
  TRANSLATIONS,
  translateCrd,
  translateKubernetesOpenApi,
  translateKubernetesSchema,
} from "../src/kubernetes";
import { parseRuleSet } from "../src/parse";

// Test-only override: every row exact, so the recogniser is exercised regardless of the defaults.
const allExact = Object.fromEntries(ROW_IDS.map((r) => [r, "exact"])) as Record<
  RowId,
  "exact"
>;

const str = { type: "string" };
const props = {
  plan: str,
  company: str,
  region: str,
  a: str,
  b: str,
  c: str,
  min: { type: "integer" },
  max: { type: "integer" },
  ratio: { type: "number" },
  flag: { type: "boolean" },
  start: { type: "string", format: "date" },
  end: { type: "string", format: "date" },
  t1: { type: "string", format: "date-time" },
  t2: { type: "string", format: "date-time" },
};

function node(cel: string, extra: Record<string, unknown> = {}) {
  return {
    type: "object",
    properties: props,
    "x-kubernetes-validations": [{ rule: cel, message: "msg", ...extra }],
  };
}

function run(cel: string, extra: Record<string, unknown> = {}) {
  const r = translateKubernetesSchema(node(cel, extra), {
    schemaName: "S",
    translations: allExact,
  });
  const set = (r.schema as { "x-validonce"?: unknown })["x-validonce"];
  return { ...r, rules: set ? parseRuleSet(set).rules : [] };
}

const rulesOf = (schema: unknown) =>
  parseRuleSet((schema as Record<string, unknown>)["x-validonce"]).rules;

const present = (field: string) => ({ present: { field } });
const eq = (field: string, value: string | number | boolean) => ({
  eq: { field, value },
});
const ne = (field: string, value: string | number | boolean) => ({
  ne: { field, value },
});

describe("CEL -> rule table", () => {
  const rw = (when: unknown, field = "company") => ({
    kind: "required_when",
    field,
    when,
  });
  const cmp = (left: string, op: string, right: unknown, type: string) => ({
    kind: "compare",
    left: { field: left },
    op,
    right,
    type,
  });

  const table: Array<[string, Record<string, unknown>]> = [
    // required_when and its mirror forms
    ["!(self.plan == 'pro') || has(self.company)", rw(eq("plan", "pro"))],
    ["self.plan == 'pro' ? has(self.company) : true", rw(eq("plan", "pro"))],
    ["has(self.company) || !(self.plan == 'pro')", rw(eq("plan", "pro"))],
    ["self.plan != 'pro' || has(self.company)", rw(eq("plan", "pro"))],
    ['self.plan == "pro" ? true : has(self.company)', rw(ne("plan", "pro"))],
    [
      "!(self.plan in ['pro', 'team']) || has(self.company)",
      rw({ in: { field: "plan", values: ["pro", "team"] } }),
    ],
    ["!has(self.region) || has(self.company)", rw(present("region"))],
    ["has(self.region) ? has(self.company) : true", rw(present("region"))],
    [
      "!(self.plan == 'pro' && has(self.region)) || has(self.company)",
      rw({ all: [eq("plan", "pro"), present("region")] }),
    ],
    [
      "self.plan != 'pro' || !has(self.region) || has(self.company)",
      rw({ all: [eq("plan", "pro"), present("region")] }),
    ],
    [
      "!(self.plan == 'pro' || self.plan == 'team') || has(self.company)",
      rw({ any: [eq("plan", "pro"), eq("plan", "team")] }),
    ],
    [
      "!(!has(self.region) && self.plan != 'pro') || has(self.company)",
      rw({ all: [{ absent: { field: "region" } }, ne("plan", "pro")] }),
    ],
    ["!has(self.region) ? true : has(self.company)", rw(present("region"))],
    ["self.min == 3 ? has(self.company) : true", rw(eq("min", 3))],
    ["self.flag == true ? has(self.company) : true", rw(eq("flag", true))],
    ["self.ratio == 1.5 ? has(self.company) : true", rw(eq("ratio", 1.5))],
    ["self.min == -2 ? has(self.company) : true", rw(eq("min", -2))],
    [
      "(self.plan == 'it\\'s') ? has(self.company) : true",
      rw(eq("plan", "it's")),
    ],
    // compare
    ["self.max >= self.min", cmp("max", "ge", { field: "min" }, "number")],
    ["self.max > 5", cmp("max", "gt", { value: 5 }, "number")],
    ["5 < self.max", cmp("max", "gt", { value: 5 }, "number")],
    ["5 <= self.max", cmp("max", "ge", { value: 5 }, "number")],
    ["self.ratio <= 1.5", cmp("ratio", "le", { value: 1.5 }, "number")],
    ["self.min >= -1", cmp("min", "ge", { value: -1 }, "number")],
    ["self.min == self.max", cmp("min", "eq", { field: "max" }, "number")],
    ["self.min != self.max", cmp("min", "ne", { field: "max" }, "number")],
    ["self.end > self.start", cmp("end", "gt", { field: "start" }, "date")],
    [
      "self.end > '2026-01-01'",
      cmp("end", "gt", { value: "2026-01-01" }, "date"),
    ],
    [
      "timestamp(self.t1) < timestamp(self.t2)",
      cmp("t1", "lt", { field: "t2" }, "datetime"),
    ],
    ["self.a != self.b", cmp("a", "ne", { field: "b" }, "string")],
    ["self.a < 'm'", cmp("a", "lt", { value: "m" }, "string")],
    // date-time strings compared without timestamp() are plain string compares in CEL
    ["self.t1 < self.t2", cmp("t1", "lt", { field: "t2" }, "string")],
    // field sets
    [
      "has(self.a) || has(self.b) || has(self.c)",
      { kind: "at_least_one_of", fields: ["a", "b", "c"] },
    ],
    [
      "[has(self.a), has(self.b)].exists_one(x, x)",
      { kind: "exactly_one_of", fields: ["a", "b"] },
    ],
    [
      "(has(self.a) ? 1 : 0) + (has(self.b) ? 1 : 0) + (has(self.c) ? 1 : 0) == 1",
      { kind: "exactly_one_of", fields: ["a", "b", "c"] },
    ],
    [
      "1 == (has(self.a) ? 1 : 0) + (has(self.b) ? 1 : 0)",
      { kind: "exactly_one_of", fields: ["a", "b"] },
    ],
    [
      "[has(self.a), has(self.b), has(self.c)].exists_one(v, v)",
      { kind: "exactly_one_of", fields: ["a", "b", "c"] },
    ],
    ["has(self.a) == has(self.b)", { kind: "all_or_none", fields: ["a", "b"] }],
    [
      "has(self.a) == has(self.b) && has(self.b) == has(self.c)",
      { kind: "all_or_none", fields: ["a", "b", "c"] },
    ],
    [
      "(has(self.a) && has(self.b)) || (!has(self.a) && !has(self.b))",
      { kind: "all_or_none", fields: ["a", "b"] },
    ],
  ];

  test.each(table)("%s", (cel, expected) => {
    const r = run(cel);
    expect(r.report).toHaveLength(1);
    expect(r.report[0]?.outcome).toBe("translated");
    expect(r.rules).toHaveLength(1);
    const rule = r.rules[0] as unknown as Record<string, unknown>;
    expect(rule).toMatchObject(expected);
    expect(rule.server_only).toBeUndefined();
    expect(rule.id).toBe(`k8s.S.${expected.kind}.0`);
    expect(rule.message).toEqual({ key: "k8s.S.0" });
    expect(r.catalog["k8s.S.0"]).toBe("msg");
  });

  test("a bare absent condition comes from `!has(...)` on the condition side", () => {
    const r = run("has(self.region) || has(self.company)");
    // two has() terms is at_least_one_of, never required_when
    expect(r.rules[0]?.kind).toBe("at_least_one_of");
    const w = run("self.plan == 'x' ? has(self.company) : true");
    expect(w.rules[0]?.kind).toBe("required_when");
    const abs = run("has(self.region) ? true : has(self.company)");
    expect((abs.rules[0] as { when: unknown }).when).toEqual({
      absent: { field: "region" },
    });
  });
});

describe("unrecognised CEL stays server_only", () => {
  const cases: Array<[string, RegExp]> = [
    ["self.a + self.b > 3", /arithmetic operator '\+'/],
    [
      "(has(self.a) ? 1 : 0) + (has(self.b) ? 1 : 0) <= 1",
      /only supported as '== 1'/,
    ],
    [
      "(has(self.a) ? 1 : 0) + (has(self.b) ? 1 : 0) == 2",
      /only supported as '== 1'/,
    ],
    [
      "(has(self.a) ? 1 : 0) + (has(self.b) ? 2 : 0) == 1",
      /arithmetic operator '\+'/,
    ],
    [
      "(has(self.a) ? 1 : 0) + (self.plan == 'x' ? 1 : 0) == 1",
      /arithmetic operator '\+'/,
    ],
    [
      "(has(self.a) ? 1 : 0) + (has(self.a) ? 1 : 0) == 1",
      /two or more distinct/,
    ],
    ["(self.min + 1) > self.max", /arithmetic operator '\+'/],
    ["self.min - 1 > 3", /arithmetic operator '-'/],
    ["self.a.b == 1", /after self\.a/],
    ["has(self.a.b)", /after self\.a/],
    ["self.a.startsWith('x')", /after self\.a/],
    ["self.a.matches('^x')", /after self\.a/],
    ["self.a == oldSelf.a", /oldSelf/],
    ["oldSelf.a <= self.a", /oldSelf/],
    ["self.a.all(i, i > 0)", /after self\.a/],
    ["size(self.a) > 0", /function 'size'/],
    ["self.a == null", /null/],
    ["self.min > 1u", /number syntax/],
    ["self.a ==", /end of expression/],
    ["self.a == 'abc", /unterminated/],
    ["self.a = 1", /unsupported character/],
    ["self.a == 'x' && self.b == 'y'", /conjunction/],
    ["has(self.a)", /translation table|shape/],
    ["self.a < self.min", /string with number/],
    ["self.flag > true", /not comparable/],
    ["self.missing > 3", /not declared/],
    ["self.start < self.t1", /date with string/],
    ["timestamp(self.t1) < self.t2", /one side/],
    ["timestamp(self.t1) < timestamp('2026-01-01T00:00:00Z')", /takes self/],
    ["timestamp(self.start) < timestamp(self.end)", /date-time string/],
    ["self.min > 'x'", /does not match/],
    ["self.end > 'tomorrow'", /does not match/],
    ["[has(self.a), has(self.b)].all(x, x)", /macro 'all'/],
    ["[has(self.a), has(self.b)].exists_one(x, y)", /exists_one\(x, x\)/],
    ["[self.a, self.b].exists_one(x, x)", /has\(\)/],
    ["has(self.a) || has(self.b) || self.plan == 'x'", /disjunction/],
    ["self.plan == 'x' ? has(self.a) : has(self.b)", /conditional/],
    ["self.plan > 'a' ? has(self.a) : true", /ordering/],
    ["self.plan in [self.a] ? has(self.b) : true", /literal|\[/],
    ["self.a ? has(self.b) : true", /not in the translation|condition shape/],
    ["self.plan in [] ? has(self.b) : true", /empty list/],
    ["self.plan == '''x''' ? has(self.b) : true", /triple/],
    ["self.plan == '\\x41' ? has(self.b) : true", /escape/],
    ["self", /translation table/],
    ["self.a == 99999999999999999999", /representable/],
  ];

  test.each(cases)("%s", (cel, reason) => {
    const r = run(cel);
    expect(r.report).toHaveLength(1);
    const entry = r.report[0];
    expect(entry?.outcome).toBe("server_only");
    expect(entry?.reason).toMatch(reason);
    expect(entry?.cel).toBe(cel);
    // unrecognised CEL is reported only; nothing goes into x-validonce or the catalog
    expect(r.rules).toEqual([]);
    expect(entry?.ruleId).toBeUndefined();
    expect(r.catalog).toEqual({});
  });

  test("parseCel never throws", () => {
    for (const junk of [
      "",
      "(((",
      "))",
      "self..a",
      "'",
      '"\\',
      "[",
      "?:",
      "1 2",
      "@",
      "has(",
      "self.a ? ",
    ]) {
      expect(parseCel(junk).ok).toBe(false);
    }
  });

  test("a rule on a non-object node is reported, not emitted", () => {
    const r = translateKubernetesSchema(
      {
        type: "string",
        "x-kubernetes-validations": [{ rule: "self.size() > 1" }],
      },
      { schemaName: "S", translations: allExact },
    );
    expect(r.report[0]?.reason).toMatch(/not an object/);
    expect(
      (r.schema as Record<string, unknown>)["x-validonce"],
    ).toBeUndefined();
  });

  test("a validation with no rule string is reported", () => {
    const r = translateKubernetesSchema(
      { type: "object", "x-kubernetes-validations": [{ message: "x" }, 7] },
      { schemaName: "S" },
    );
    expect(r.report.map((e) => e.outcome)).toEqual([
      "server_only",
      "server_only",
    ]);
  });
});

describe("allowlist", () => {
  const cel = "self.max >= self.min";

  test("every row defaults to drop, and a dropped row keeps its recognised rule as server_only", () => {
    expect(Object.values(TRANSLATIONS).every((l) => l === "drop")).toBe(true);
    const r = translateKubernetesSchema(node(cel), { schemaName: "S" });
    const rules = parseRuleSet(
      (r.schema as Record<string, unknown>)["x-validonce"],
    ).rules;
    expect(rules[0]).toMatchObject({
      kind: "compare",
      left: { field: "max" },
      server_only: true,
      message: { key: "k8s.S.0", params: { cel } },
    });
    expect(r.report[0]?.reason).toMatch(/not allowlisted/);
  });

  test("guarded: the guard decides from the field schemas", () => {
    const schema = (extra: object) => ({
      type: "object",
      required: ["min", "max"],
      properties: {
        min: { type: "integer" },
        max: { type: "integer", ...extra },
      },
      "x-kubernetes-validations": [{ rule: cel }],
    });
    const ctx = {
      schemaName: "S",
      translations: { "compare.number": "guarded" },
    } as const;
    expect(translateKubernetesSchema(schema({}), ctx).report[0]?.outcome).toBe(
      "translated",
    );
    expect(
      translateKubernetesSchema(schema({ nullable: true }), ctx).report[0]
        ?.outcome,
    ).toBe("server_only");
    const optional = { ...schema({}), required: ["min"] };
    expect(translateKubernetesSchema(optional, ctx).report[0]?.reason).toMatch(
      /guard/,
    );
    // a custom guard
    const custom = translateKubernetesSchema(schema({ nullable: true }), {
      ...ctx,
      guards: { "compare.number": () => true },
    });
    expect(custom.report[0]?.outcome).toBe("translated");
  });

  test("guarded presence: a string needs minLength, an array minItems", () => {
    const mk = (a: object) => ({
      type: "object",
      properties: { a, b: { type: "boolean" } },
      "x-kubernetes-validations": [{ rule: "has(self.a) || has(self.b)" }],
    });
    const ctx = {
      schemaName: "S",
      translations: { at_least_one_of: "guarded" },
    } as const;
    const out = (a: object) =>
      translateKubernetesSchema(mk(a), ctx).report[0]?.outcome;
    expect(out({ type: "string" })).toBe("server_only");
    expect(out({ type: "string", minLength: 1 })).toBe("translated");
    expect(out({ type: "array", minItems: 1 })).toBe("translated");
    expect(out({ type: "array" })).toBe("server_only");
    expect(out({ type: ["integer", "null"] })).toBe("server_only");
  });
});

describe("messages, ids and paths", () => {
  test("messageExpression and missing message use the generic key with the CEL", () => {
    const cel = "self.max >= self.min";
    const expr = run(cel, { messageExpression: "'max ' + string(self.max)" });
    expect(expr.rules[0]?.message).toEqual({
      key: "k8s.rule_failed",
      params: { cel },
    });
    expect(expr.catalog["k8s.rule_failed"]).toBe("failed rule: {cel}");
    expect(expr.catalog["k8s.S.0"]).toBeUndefined();

    const bare = translateKubernetesSchema(
      {
        type: "object",
        properties: props,
        "x-kubernetes-validations": [{ rule: cel }],
      },
      { schemaName: "S", translations: allExact },
    );
    const set = parseRuleSet(
      (bare.schema as Record<string, unknown>)["x-validonce"],
    );
    expect(set.rules[0]?.message.key).toBe("k8s.rule_failed");
  });

  test("a server_only rule keeps its static message key and carries the CEL", () => {
    const r = translateKubernetesSchema(node("self.max > 1"), {
      schemaName: "S",
    });
    expect(rulesOf(r.schema)[0]?.message).toEqual({
      key: "k8s.S.0",
      params: { cel: "self.max > 1" },
    });
  });

  test("fieldPath with one segment becomes path; deeper keeps the default and is noted", () => {
    const one = run("self.max >= self.min", { fieldPath: ".max" });
    expect(one.rules[0]?.path).toBe("max");
    const deep = run("self.max >= self.min", { fieldPath: ".spec.end" });
    expect(deep.rules[0]?.path).toBeUndefined();
    expect(deep.report[0]?.notes?.[0]).toMatch(/fieldPath/);
    const idx = run("self.max >= self.min", { fieldPath: ".a[0]" });
    expect(idx.rules[0]?.path).toBeUndefined();
  });
});

describe("schema walking", () => {
  const original = () => ({
    type: "object",
    properties: {
      spec: {
        type: "object",
        properties: {
          min: { type: "integer" },
          max: { type: "integer" },
          list: {
            type: "array",
            items: {
              type: "object",
              properties: { x: str, y: str },
              "x-kubernetes-validations": [
                { rule: "has(self.x) || has(self.y)", message: "x or y" },
              ],
            },
          },
          map: {
            type: "object",
            additionalProperties: {
              type: "object",
              properties: { x: str, y: str },
              "x-kubernetes-validations": [
                { rule: "has(self.x) == has(self.y)" },
              ],
            },
          },
        },
        "x-kubernetes-validations": [
          { rule: "self.max >= self.min", message: "max below min" },
          { rule: "self.min + 1 > 0", message: "positive" },
        ],
      },
    },
    "x-kubernetes-validations": [{ rule: "has(self.spec)" }],
  });

  test("walks properties, items and additionalProperties; unique ids and keys; original untouched", () => {
    const input = original();
    const snapshot = structuredClone(input);
    const r = translateKubernetesSchema(input, {
      schemaName: "Sig",
      translations: allExact,
    });
    expect(input).toEqual(snapshot);

    const out = r.schema as ReturnType<typeof original>;
    // x-kubernetes-validations is kept next to x-validonce
    expect(out.properties.spec["x-kubernetes-validations"]).toEqual(
      snapshot.properties.spec["x-kubernetes-validations"],
    );
    const ids: string[] = [];
    for (const n of [
      out,
      out.properties.spec,
      out.properties.spec.properties.list.items,
      out.properties.spec.properties.map.additionalProperties,
    ]) {
      if ("x-validonce" in n) ids.push(...rulesOf(n).map((x) => x.id));
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      // rules 0 (bare has()) and 2 (arithmetic) are unrecognised: reported, not emitted
      "k8s.Sig.compare.1",
      "k8s.Sig.at_least_one_of.3",
      "k8s.Sig.all_or_none.4",
    ]);
    expect(r.report.map((e) => [e.schemaPath, e.index, e.outcome])).toEqual([
      ["", 0, "server_only"],
      ["/properties/spec", 0, "translated"],
      ["/properties/spec", 1, "server_only"],
      ["/properties/spec/properties/list/items", 0, "translated"],
      ["/properties/spec/properties/map/additionalProperties", 0, "translated"],
    ]);
    expect(r.catalog["k8s.Sig.1"]).toBe("max below min");
    expect(r.catalog["k8s.Sig.3"]).toBe("x or y");
  });

  test("an existing x-validonce on the node is kept and extended", () => {
    const existing = {
      id: "mine",
      kind: "at_least_one_of",
      fields: ["a", "b"],
      message: { key: "m" },
    };
    const n = {
      ...node("self.max >= self.min"),
      "x-validonce": { version: 1, rules: [existing] },
    };
    const r = translateKubernetesSchema(n, {
      schemaName: "S",
      translations: allExact,
    });
    const rules = parseRuleSet(
      (r.schema as Record<string, unknown>)["x-validonce"],
    ).rules;
    expect(rules.map((x) => x.id)).toEqual(["mine", "k8s.S.compare.0"]);
  });

  test("a schema without validations is returned as a plain copy", () => {
    const plain = { type: "object", properties: { a: str } };
    const r = translateKubernetesSchema(plain, { schemaName: "S" });
    expect(r.schema).toEqual(plain);
    expect(r.schema).not.toBe(plain);
    expect(r.report).toEqual([]);
    expect(translateKubernetesSchema(7, { schemaName: "S" }).schema).toBe(7);
  });
});

describe("OpenAPI document, CRD and rulesAt", () => {
  const doc = () => ({
    openapi: "3.0.0",
    components: {
      schemas: {
        "io.example.v1.Signup": {
          type: "object",
          properties: {
            spec: {
              type: "object",
              required: ["min", "max"],
              properties: {
                min: { type: "integer" },
                max: { type: "integer" },
              },
              "x-kubernetes-validations": [
                { rule: "self.max >= self.min", message: "max must be >= min" },
              ],
            },
          },
        },
        Other: { type: "object", properties: {} },
      },
    },
  });

  test("translates components.schemas, leaves the input alone, round-trips as JSON", () => {
    const input = doc();
    const snapshot = structuredClone(input);
    const { doc: out, catalog, report } = translateKubernetesOpenApi(input);
    expect(input).toEqual(snapshot);
    expect(report).toHaveLength(1);
    expect(report[0]).toMatchObject({
      schema: "io.example.v1.Signup",
      schemaPath: "/properties/spec",
      outcome: "server_only", // defaults are all drop
    });
    expect(catalog["k8s.io.example.v1.Signup.0"]).toBe("max must be >= min");
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    const rs = rulesAt(out, "io.example.v1.Signup", "/properties/spec");
    expect(rs?.rules[0]).toMatchObject({
      id: "k8s.io.example.v1.Signup.compare.0",
      server_only: true,
    });
    expect(rulesAt(out, "Other", "")).toBeUndefined();
  });

  test("rulesAt: pointers, escapes, missing nodes, bad pointers", () => {
    const rules = {
      version: 1,
      rules: [
        {
          id: "r",
          kind: "all_or_none",
          fields: ["a", "b"],
          message: { key: "k" },
        },
      ],
    };
    const d = {
      components: {
        schemas: {
          S: {
            properties: { "a/b": { "x-validonce": rules } },
            "x-validonce": rules,
          },
        },
      },
    };
    expect(rulesAt(d, "S", "")?.rules).toHaveLength(1);
    expect(rulesAt(d, "S", "/properties/a~1b")?.rules).toHaveLength(1);
    expect(rulesAt(d, "S", "/properties/nope")).toBeUndefined();
    expect(rulesAt(d, "Nope", "")).toBeUndefined();
    expect(rulesAt({}, "S", "")).toBeUndefined();
    expect(() => rulesAt(d, "S", "properties")).toThrow(/JSON pointer/);
    const bad = {
      components: { schemas: { S: { "x-validonce": { version: 2 } } } },
    };
    expect(() => rulesAt(bad, "S", "")).toThrow(/S: unsupported version/);
  });

  test("translateCrd translates each served version", () => {
    const schema = (extra: object[]) => ({
      openAPIV3Schema: {
        type: "object",
        properties: {
          spec: {
            type: "object",
            properties: { min: { type: "integer" }, max: { type: "integer" } },
            "x-kubernetes-validations": extra,
          },
        },
      },
    });
    const crd = {
      apiVersion: "apiextensions.k8s.io/v1",
      kind: "CustomResourceDefinition",
      metadata: { name: "signups.example.test" },
      spec: {
        names: { kind: "Signup" },
        versions: [
          {
            name: "v1",
            schema: schema([{ rule: "self.max >= self.min", message: "m" }]),
          },
          {
            name: "v2",
            schema: schema([{ rule: "self.max > self.min", message: "m2" }]),
          },
          { name: "v0" },
        ],
      },
    };
    const snapshot = structuredClone(crd);
    const out = translateCrd(crd);
    expect(crd).toEqual(snapshot);
    expect(Object.keys(out.versions)).toEqual(["v1", "v2"]);
    const v1 = out.versions.v1;
    expect(v1?.report[0]).toMatchObject({
      schema: "Signup",
      schemaPath: "/properties/spec",
    });
    expect(v1?.catalog["k8s.Signup.0"]).toBe("m");
    const exact = translateKubernetesSchema(
      (crd.spec.versions[0] as { schema: { openAPIV3Schema: unknown } }).schema
        .openAPIV3Schema,
      { schemaName: "Signup", translations: allExact },
    );
    const spec = rulesOf(
      (exact.schema as { properties: { spec: unknown } }).properties.spec,
    );
    expect(spec[0]).toMatchObject({
      kind: "compare",
      op: "ge",
    });
    expect(translateCrd({}).versions).toEqual({});
  });
});
