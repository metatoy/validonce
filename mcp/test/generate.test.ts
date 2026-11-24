// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, it } from "vitest";
import { generateInputs } from "../src/generate";

const cmp = (id: string, left: string, right: object, type: string) => ({ id, kind: "compare", left: { field: left }, op: "ge", right, type, message: { key: "k" } });

describe("generateInputs type filter", () => {
  it("drops impossible dates and checks formats inside anyOf branches", () => {
    const rules = { version: 1, rules: [cmp("R.end", "end", { field: "start" }, "date")] };
    // FastAPI writes an optional date as anyOf [date string, null]
    const properties = {
      start: { type: "string", format: "date" },
      end: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
    };
    const { inputs } = generateInputs({ rules, properties, count: 3000, seed: 1 });
    const dates = inputs.flatMap((i) => [i.start, i.end]).filter((v): v is string => typeof v === "string");
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10)).toBe(d); // a real calendar day (no 2026-02-30)
    }
    expect(inputs.some((i) => i.end === null)).toBe(true);
  });

  it("keeps each rule's matrix and seeds when other rules' fields are required", () => {
    const rules = { version: 1, rules: [cmp("R.end", "end", { field: "start" }, "date"), cmp("R.qty", "quantity", { value: 1 }, "number")] };
    const properties = { start: { type: "string", format: "date" }, end: { type: "string", format: "date" }, quantity: { type: "integer" } };
    const g = generateInputs({ rules, properties, required: ["start", "quantity"], count: 0, seed: 1 });
    expect(g.matrixSize).toBeGreaterThan(0);
    expect(g.seedCount).toBeGreaterThan(0);
    expect(g.inputs.every((i) => "start" in i && "quantity" in i)).toBe(true);
    // the quantity rule's own boundary states survive (0 and 1 both appear)
    expect(g.inputs.some((i) => i.quantity === 0) && g.inputs.some((i) => i.quantity === 1)).toBe(true);
  });

  it("stays fast with many required object fields", () => {
    const fields = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const rules = { version: 1, rules: [{ id: "R.all", kind: "all_or_none", fields, message: { key: "k" } }] };
    const properties = Object.fromEntries(fields.map((f) => [f, { type: "object" }]));
    const t = Date.now();
    const g = generateInputs({ rules, properties, required: fields, count: 2000, seed: 1 });
    expect(Date.now() - t).toBeLessThan(5000);
    expect(g.randomCount).toBe(2000);
    expect(g.inputs.every((i) => fields.every((f) => typeof i[f] === "object" && i[f] !== null && !Array.isArray(i[f])))).toBe(true);
  });
});
