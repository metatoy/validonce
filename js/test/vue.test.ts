// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { validate } from "vee-validate";
import { describe, expect, test, vi } from "vitest";
import { nextTick, reactive } from "vue";
import { z } from "zod";
import type { Rule } from "../src/types";
import { toVeeSchema, veePath, watchDependents } from "../src/vue";
import { withRules } from "../src/zod";

const rules: Rule[] = [
  {
    id: "S.required_when.company",
    kind: "required_when",
    field: "company",
    when: { eq: { field: "plan", value: "pro" } },
    message: { key: "rules.company_required" },
  },
  {
    id: "S.compare.end",
    kind: "compare",
    left: { field: "end" },
    op: "ge",
    right: { field: "start" },
    type: "string",
    message: { key: "rules.end_after_start" },
  },
];

const schema = withRules(
  z.object({
    plan: z.enum(["free", "pro"]),
    company: z.string().nullable(),
    start: z.string(),
    end: z.string().nullable(),
  }),
  rules,
  { messages: { "rules.company_required": "Company is required" } },
);

describe("veePath", () => {
  test("joins keys, numbers become indexes, objects use key", () => {
    expect(veePath(["a", "b"])).toBe("a.b");
    expect(veePath(["items", 1, "end"])).toBe("items[1].end");
    expect(veePath([{ key: "a" }, { key: 0 }])).toBe("a[0]");
    expect(veePath(undefined)).toBe("");
  });
});

describe("toVeeSchema", () => {
  test("has the vee-validate brand and returns the parsed value", async () => {
    const typed = toVeeSchema(schema);
    expect(typed.__type).toBe("VVTypedSchema");
    const ok = { plan: "free" as const, company: null, start: "a", end: null };
    expect(await typed.parse(ok)).toEqual({ value: ok, errors: [] });
  });

  test("groups issues by path, rule errors with field errors", async () => {
    const res = await toVeeSchema(schema).parse({
      plan: "pro",
      company: null,
      start: "2026-03-10",
      end: "2026-03-01",
    } as never);
    expect(res.value).toBeUndefined();
    expect(res.errors).toEqual([
      { path: "company", errors: ["Company is required"] },
      { path: "end", errors: ["This value is not allowed here."] },
    ]);
  });

  test("a failed field type check and a rule error both appear", async () => {
    const res = await toVeeSchema(schema).parse({
      plan: "pro",
      company: null,
      start: 5,
      end: null,
    } as never);
    expect(res.errors.map((e) => e.path).sort()).toEqual(["company", "start"]);
  });

  test("works with vee-validate's own validate()", async () => {
    const bad = await validate(
      { plan: "pro", company: null, start: "a", end: null } as never,
      toVeeSchema(schema),
    );
    expect(bad.valid).toBe(false);
    expect(bad.errors).toEqual(["Company is required"]);
  });
});

describe("watchDependents", () => {
  function setup() {
    const values = reactive<Record<string, unknown>>({
      plan: "free",
      company: null,
      start: "",
      end: null,
    });
    const validateField = vi.fn(async () => ({}));
    const stop = watchDependents({ values, validateField }, rules);
    return { values, validateField, stop };
  }

  test("a changed field re-validates the fields that read it", async () => {
    const { values, validateField } = setup();
    values.plan = "pro";
    await nextTick();
    expect(validateField.mock.calls).toEqual([["company"]]);
    values.start = "2026-01-01";
    await nextTick();
    expect(validateField.mock.calls).toEqual([["company"], ["end"]]);
  });

  test("a field nothing depends on triggers nothing; no change, no call", async () => {
    const { values, validateField } = setup();
    values.company = "Example Co";
    values.end = "2026-02-01";
    values.plan = "free";
    await nextTick();
    expect(validateField).not.toHaveBeenCalled();
  });

  test("stop() ends the watchers", async () => {
    const { values, validateField, stop } = setup();
    stop();
    values.plan = "pro";
    await nextTick();
    expect(validateField).not.toHaveBeenCalled();
  });

  test("server_only rules are ignored", async () => {
    const values = reactive<Record<string, unknown>>({ a: 1, b: 1 });
    const validateField = vi.fn(async () => ({}));
    const serverOnly: Rule = {
      id: "S.c",
      kind: "compare",
      left: { field: "b" },
      op: "ge",
      right: { field: "a" },
      type: "number",
      server_only: true,
      message: { key: "k" },
    };
    watchDependents({ values, validateField }, [serverOnly]);
    values.a = 2;
    await nextTick();
    expect(validateField).not.toHaveBeenCalled();
  });

  test("in-place array changes re-validate (present on an array field)", async () => {
    const values = reactive<Record<string, unknown>>({
      tags: [],
      company: null,
    });
    const validateField = vi.fn(async () => ({}));
    const arrayRule: Rule = {
      id: "S.required_when.company",
      kind: "required_when",
      field: "company",
      when: { present: { field: "tags" } },
      message: { key: "k" },
    };
    watchDependents({ values, validateField }, [arrayRule]);
    (values.tags as string[]).push("a");
    await nextTick();
    expect(validateField.mock.calls).toEqual([["company"]]);
    (values.tags as string[]).splice(0);
    await nextTick();
    expect(validateField.mock.calls).toEqual([["company"], ["company"]]);
  });
});
