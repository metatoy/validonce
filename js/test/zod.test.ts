// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { parseRuleSet } from "../src/index";
import { withRules } from "../src/zod";

const ruleSet = parseRuleSet({
  version: 1,
  rules: [
    {
      id: "Signup.required_when.company",
      kind: "required_when",
      field: "company",
      when: { eq: { field: "plan", value: "pro" } },
      message: { key: "rules.company_required", params: { min: 2 } },
    },
    {
      id: "Signup.required_when.server",
      kind: "required_when",
      field: "plan",
      when: { present: { field: "plan" } },
      message: { key: "rules.server" },
      server_only: true,
    },
  ],
});

const base = z.object({
  plan: z.string(),
  company: z.string().nullable().optional(),
  qty: z.number(),
});
const schema = withRules(base, ruleSet, {
  messages: { "rules.company_required": "Company is required (min {min})." },
});

describe("withRules", () => {
  test("valid data parses unchanged", () => {
    const input = { plan: "free", qty: 3 };
    expect(schema.parse(input)).toEqual(input);
    const pro = { plan: "pro", company: "Example Co", qty: 1 };
    expect(schema.parse(pro)).toEqual(pro);
  });

  test("accepts a plain rule array", () => {
    const s = withRules(base, ruleSet.rules);
    expect(s.safeParse({ plan: "pro", qty: 1 }).success).toBe(false);
  });

  test("rules naming a field missing from the schema throw at withRules time", () => {
    expect(() => withRules(z.object({ plan: z.string() }), ruleSet)).toThrow(
      /rule "Signup.required_when.company" refers to field "company"/,
    );
  });

  test("server_only rules are skipped on the client", () => {
    const r = schema.safeParse({ plan: "pro", company: "x", qty: 1 });
    expect(r.success).toBe(true);
  });

  test("unknown: a field type error does not stop cross-field rules", () => {
    // Zod 4.6.7: .refine()/.superRefine() on an object are SKIPPED when any
    // child fails (the superRefine callback never ran in a probe). A check
    // with `when: () => true` still runs, and its payload.value is the RAW
    // input (qty is still "oops"), so withRules evaluates raw values.
    const skipped = base.superRefine((_v, ctx) => {
      ctx.addIssue({ code: "custom", message: "ran", path: ["company"] });
    });
    const plain = skipped.safeParse({ plan: "pro", qty: "oops" });
    expect(plain.error?.issues.map((i) => i.path[0])).toEqual(["qty"]);

    const r = schema.safeParse({ plan: "pro", qty: "oops" });
    expect(r.success).toBe(false);
    const issues = r.error?.issues ?? [];
    expect(
      issues.some((i) => i.path[0] === "qty" && i.code === "invalid_type"),
    ).toBe(true);
    expect(
      issues.some((i) => i.path[0] === "company" && i.code === "custom"),
    ).toBe(true);
  });

  test("a non-object input does not crash the rules", () => {
    // Zod 4.6.7 still runs the always-on check with the raw non-object value.
    const r = schema.safeParse(5);
    expect(r.error?.issues).toHaveLength(1);
    expect(r.error?.issues[0]?.code).toBe("invalid_type");
  });

  test("unknown: issue path and params survive", () => {
    // Zod 4.6.7 keeps `params` on the issue object (and in error.issues).
    const r = schema.safeParse({ plan: "pro", qty: 1 });
    const issue = r.error?.issues.find((i) => i.code === "custom");
    expect(issue?.path).toEqual(["company"]);
    expect(issue?.message).toBe("Company is required (min 2).");
    expect(issue).toMatchObject({
      params: {
        validonce: true,
        ruleId: "Signup.required_when.company",
        key: "rules.company_required",
        params: { min: 2 },
      },
    });
  });

  test("message falls back to the key without a catalog", () => {
    const r = withRules(base, ruleSet).safeParse({ plan: "pro", qty: 1 });
    expect(r.error?.issues[0]?.message).toBe("rules.company_required");
  });

  test("unknown: Standard Schema output", async () => {
    // Zod 4.6.7: the Standard Schema issue is the Zod issue itself, so
    // message and path survive, and so does the extra `params` property
    // (not part of the Standard Schema type, but present at runtime).
    const result = await schema["~standard"].validate({ plan: "pro", qty: 1 });
    expect(result.issues).toHaveLength(1);
    const issue = result.issues?.[0] as unknown as Record<string, unknown>;
    expect(issue.message).toBe("Company is required (min 2).");
    expect(issue.path).toEqual(["company"]);
    expect(issue.params).toMatchObject({
      ruleId: "Signup.required_when.company",
      key: "rules.company_required",
      params: { min: 2 },
    });
  });

  test("unknown: react-hook-form", async () => {
    // @hookform/resolvers 7.0.8 + react-hook-form 7.92.0 run headless in
    // node (needs the react devDependency installed, nothing rendered).
    const resolver = zodResolver(schema);
    const res = await resolver({ plan: "pro", qty: 1 } as never, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    } as never);
    const errors = res.errors as Record<
      string,
      { message?: string; type?: string }
    >;
    expect(errors.company?.message).toBe("Company is required (min 2).");
  });
});
