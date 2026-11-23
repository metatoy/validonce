// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, test } from "vitest";
import { z } from "zod";
import { defaultMessages, formatMessage } from "../src/messages";
import { fieldErrorsFromIssues } from "../src/server-errors";
import type { Issue, Rule } from "../src/types";
import { withRules } from "../src/zod";

const rules: Rule[] = [
  {
    id: "S.required_when.company",
    kind: "required_when",
    field: "company",
    when: { present: { field: "plan" } },
    message: { key: "rules.company_required", params: { min: 2 } },
  },
  {
    id: "S.compare.end",
    kind: "compare",
    left: { field: "end" },
    op: "ge",
    right: { field: "start" },
    type: "string",
    message: { key: "rules.end" },
  },
  {
    id: "S.at_least_one_of.a",
    kind: "at_least_one_of",
    fields: ["a", "b"],
    message: { key: "rules.any" },
  },
  {
    id: "S.exactly_one_of.a",
    kind: "exactly_one_of",
    fields: ["a", "b"],
    message: { key: "rules.one" },
  },
  {
    id: "S.all_or_none.a",
    kind: "all_or_none",
    fields: ["a", "b"],
    message: { key: "rules.all" },
  },
];

const issue = (ruleId: string, key: string, params = {}): Issue => ({
  path: ["x"],
  ruleId,
  key,
  params,
});

describe("formatMessage", () => {
  test("catalog wins and interpolates; missing params stay", () => {
    const i = issue("S.required_when.company", "k", { min: 2 });
    expect(formatMessage(i, { k: "At least {min}, {other}." }, rules)).toBe(
      "At least 2, {other}.",
    );
  });

  test("falls back to the default per kind", () => {
    for (const r of rules) {
      expect(formatMessage(issue(r.id, "nope"), {}, rules)).toBe(
        defaultMessages[r.kind],
      );
    }
    expect(defaultMessages.at_least_one_of).toBe(
      "Fill in at least one of these fields.",
    );
  });

  test("accepts a RuleSet or a ruleId -> kind map", () => {
    const i = issue("S.compare.end", "nope");
    const want = defaultMessages.compare;
    expect(formatMessage(i, undefined, { rules })).toBe(want);
    expect(formatMessage(i, undefined, { "S.compare.end": "compare" })).toBe(
      want,
    );
  });

  test("unknown rule: the key", () => {
    expect(formatMessage(issue("zzz", "rules.q"), {}, rules)).toBe("rules.q");
    expect(formatMessage(issue("zzz", "rules.q"))).toBe("rules.q");
  });
});

test("withRules and fieldErrorsFromIssues give identical text", () => {
  const schema = withRules(
    z.object({
      plan: z.string().optional(),
      company: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      a: z.string().optional(),
      b: z.string().optional(),
    }),
    rules,
    { messages: { "rules.company_required": "Company needs {min}." } },
  );
  const r = schema.safeParse({ plan: "pro", start: "b", end: "a" });
  const fromZod: Record<string, string> = {};
  for (const i of r.error?.issues ?? []) {
    fromZod[i.path.join(".")] ??= i.message; // first issue per path, as fieldErrorsFromIssues
  }
  const issues = (r.error?.issues ?? []).map((i) => {
    const p = (i as unknown as { params: Issue }).params;
    return {
      path: i.path.map(String),
      ruleId: p.ruleId,
      key: p.key,
      params: p.params,
    };
  });
  expect(Object.keys(fromZod).length).toBeGreaterThan(1);
  expect(
    fieldErrorsFromIssues(
      issues,
      { "rules.company_required": "Company needs {min}." },
      rules,
    ),
  ).toEqual(fromZod);
});
