// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, test } from "vitest";
import { zSignup } from "../src/gen/validonce.gen";

const valid = {
  plan: "free",
  company: null,
  email: "a@example.test",
  start: "2026-03-10",
  end: "2026-03-20",
  quantity: 1,
};
/** Issue keys by field path (`params.key` is the rule's message key). */
function keys(input: unknown): Map<string, string[]> {
  const r = zSignup.safeParse(input);
  const m = new Map<string, string[]>();
  if (!r.success)
    for (const i of r.error.issues) {
      const k = String(i.path[0]);
      const key = (i as { params?: { key?: string } }).params?.key ?? i.message;
      m.set(k, [...(m.get(k) ?? []), key]);
    }
  return m;
}

describe("Hey API zSignup carries the validonce rules", () => {
  test("valid input passes", () => {
    expect(zSignup.safeParse(valid).success).toBe(true);
  });
  test("pro without company: issue on company", () => {
    expect(keys({ ...valid, plan: "pro" }).get("company")).toContain(
      "rules.company_required",
    );
  });
  test("end before start: issue on end", () => {
    expect(
      keys({ ...valid, end: "2026-03-01" }).get("end"),
    ).toContain("rules.end_after_start");
  });
  test("quantity 0: issue on quantity", () => {
    expect(keys({ ...valid, quantity: 0 }).get("quantity")).toContain(
      "rules.quantity_min",
    );
  });
});
