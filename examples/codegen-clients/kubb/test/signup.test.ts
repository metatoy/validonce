// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, test } from "vitest";
import { signupSchema } from "../src/gen/validonce.gen";

const base = {
  plan: "free",
  company: null,
  email: "a@example.test",
  start: "2026-03-10",
  end: "2026-03-20",
  quantity: 1,
};

/** The issues of a failed parse as [path, key] pairs. */
function issues(value: unknown): [string, unknown][] {
  const r = signupSchema.safeParse(value);
  if (r.success) return [];
  return r.error.issues.map((i) => [
    i.path.join("."),
    (i as { params?: { key?: string } }).params?.key,
  ]);
}

describe("generated signupSchema (kubb + pluginValidonce)", () => {
  test("a valid signup passes", () => {
    expect(signupSchema.safeParse(base).success).toBe(true);
  });

  test("pro without company: issue on company", () => {
    expect(issues({ ...base, plan: "pro" })).toContainEqual([
      "company",
      "rules.company_required",
    ]);
  });

  test("end before start: issue on end", () => {
    expect(issues({ ...base, end: "2026-03-01" })).toContainEqual([
      "end",
      "rules.end_after_start",
    ]);
  });

  test("quantity 0: issue on quantity", () => {
    expect(issues({ ...base, quantity: 0 })).toContainEqual([
      "quantity",
      "rules.quantity_min",
    ]);
  });
});
