// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { dependentFields, registerDeps } from "../src/react-hook-form";
import type { Rule } from "../src/types";
import { withRules } from "../src/zod";

const rules: Rule[] = [
  {
    id: "S.required_when.company",
    kind: "required_when",
    field: "company",
    when: {
      all: [
        { eq: { field: "plan", value: "pro" } },
        { present: { field: "region" } },
      ],
    },
    message: { key: "k1" },
  },
  {
    id: "S.compare.end",
    kind: "compare",
    left: { field: "end" },
    op: "ge",
    right: { field: "start" },
    type: "string",
    message: { key: "k2" },
  },
  {
    id: "S.at_least_one_of.email",
    kind: "at_least_one_of",
    fields: ["email", "phone", "fax"],
    message: { key: "k3" },
  },
  {
    id: "S.server",
    kind: "compare",
    left: { field: "qty" },
    op: "ge",
    right: { value: 1 },
    type: "number",
    server_only: true,
    message: { key: "k4" },
  },
];

describe("dependentFields", () => {
  test("required_when, compare and group rules", () => {
    expect(dependentFields(rules)).toEqual({
      fax: ["email"],
      phone: ["email"],
      plan: ["company"],
      region: ["company"],
      start: ["end"],
    });
  });

  test("accepts a RuleSet; honours an explicit path", () => {
    const withPath: Rule = { ...(rules[1] as Rule), path: "start" };
    expect(dependentFields({ rules: [withPath] })).toEqual({ end: ["start"] });
  });
});

describe("registerDeps", () => {
  test("returns register options", () => {
    const deps = registerDeps(rules);
    expect(deps("plan")).toEqual({ deps: ["company"] });
    expect(deps("company")).toEqual({});
    expect(deps("toString")).toEqual({});
    const options = { required: false, ...deps("start") };
    expect(options.deps).toEqual(["end"]);
  });
});

// Rendering is not needed here: this checks the resolver (the validation that
// `deps` re-triggers) reports each dependent path for the same input.
test("resolver reports exactly the paths deps re-check", async () => {
  const schema = withRules(
    z.object({
      plan: z.string().optional(),
      region: z.string().optional(),
      company: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      fax: z.string().optional(),
      qty: z.number().optional(),
    }),
    rules,
  );
  const res = await zodResolver(schema)(
    { plan: "pro", region: "x", start: "b", end: "a" } as never,
    undefined,
    { fields: {}, shouldUseNativeValidation: false } as never,
  );
  const errors = Object.keys(res.errors as object).sort();
  const reported = new Set(Object.values(dependentFields(rules)).flat());
  expect(errors).toEqual(["company", "email", "end"]);
  for (const e of errors) expect(reported.has(e)).toBe(true);
});
