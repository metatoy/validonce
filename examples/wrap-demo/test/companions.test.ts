// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, test } from "vitest";

const base = {
  plan: "free",
  company: null,
  email: "a@example.test",
  start: "2026-03-10",
  end: "2026-03-20",
  quantity: 1,
};

// [companion module, export name]
const cases = [
  ["orval-aspnet", "Signup"],
  ["orval-fastapi", "Signup"],
  ["orval-signup-input", "SignupInput"],
  ["kubb-aspnet", "signupSchema"],
  ["kubb-fastapi", "signupSchema"],
  ["kubb-signup-input", "signupInputSchema"],
] as const;

describe.each(cases)("%s companion", (dir, exportName) => {
  const load = async () => {
    const mod = (await import(`../gen/${dir}/schemas.rules.ts`)) as Record<
      string,
      { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string; params?: { ruleId?: string; key?: string } }[] } } }
    >;
    const schema = mod[exportName];
    if (!schema) throw new Error(`${dir}: no export ${exportName}`);
    return schema;
  };

  test("a valid signup passes", async () => {
    expect((await load()).safeParse(base).success).toBe(true);
  });

  test("end before start fails the end_after_start rule", async () => {
    const r = (await load()).safeParse({ ...base, end: "2026-03-01" });
    expect(r.success).toBe(false);
    const issue = r.error?.issues.find((i) => i.params?.key === "rules.end_after_start");
    expect(issue?.params?.ruleId).toBe("Signup.compare.end");
  });

  test("pro plan without company fails the required_when rule", async () => {
    const r = (await load()).safeParse({ ...base, plan: "pro" });
    expect(r.error?.issues.some((i) => i.params?.ruleId === "Signup.required_when.company")).toBe(true);
  });
});
