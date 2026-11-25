// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, test } from "vitest";
import { Signup } from "../src/gen/validonce.gen";

const base = {
  plan: "free",
  company: null,
  email: "a@example.test",
  start: "2026-03-10",
  end: "2026-03-20",
  quantity: 1,
};

function issues(v: unknown) {
  const r = Signup.safeParse(v);
  return r.success ? [] : r.error.issues;
}
const key = (i: { params?: { key?: string } | undefined }) => i.params?.key;

describe("orval + validonce", () => {
  test("a valid signup passes", () => {
    expect(Signup.safeParse(base).success).toBe(true);
  });

  test("pro without company: issue on company", () => {
    const found = issues({ ...base, plan: "pro" }).filter((i) => i.path[0] === "company");
    expect(found.map((i) => key(i as never))).toEqual(["rules.company_required"]);
  });

  test("end before start: issue on end", () => {
    const found = issues({ ...base, end: "2026-03-01" }).filter((i) => i.path[0] === "end");
    expect(found.map((i) => key(i as never))).toEqual(["rules.end_after_start"]);
  });

  test("quantity 0: issue on quantity", () => {
    const found = issues({ ...base, quantity: 0 }).filter((i) => i.path[0] === "quantity");
    expect(found.map((i) => key(i as never))).toContain("rules.quantity_min");
  });
});
