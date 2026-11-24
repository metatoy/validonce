// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, test } from "vitest";
import {
  evaluate,
  FORMAT_VERSION,
  parseRuleSet,
  ValidonceFormatError,
} from "../src/index";

test("FORMAT_VERSION is 1", () => {
  expect(FORMAT_VERSION).toBe(1);
});

describe("parseRuleSet", () => {
  test("rejects version 2", () => {
    expect(() => parseRuleSet({ version: 2, rules: [] })).toThrow(
      ValidonceFormatError,
    );
  });
  test("accepts version 1", () => {
    expect(parseRuleSet({ version: 1, rules: [] })).toEqual({
      version: 1,
      rules: [],
    });
  });

  const rw = (when: unknown) => ({
    version: 1,
    rules: [
      {
        id: "R",
        kind: "required_when",
        field: "company",
        when,
        message: { key: "k" },
      },
    ],
  });
  const cmp = (extra: Record<string, unknown>) => ({
    version: 1,
    rules: [
      {
        id: "C",
        kind: "compare",
        left: { field: "end" },
        op: "ge",
        right: { field: "start" },
        type: "date",
        message: { key: "k" },
        ...extra,
      },
    ],
  });

  test("rejects malformed conditions at parse time, not inside evaluate", () => {
    for (const when of [
      { op: "eq", field: "plan", value: "pro" },
      { eq: { field: "plan" } },
      { eq: { field: "plan", value: null } },
      {
        eq: { field: "plan", value: "pro" },
        ne: { field: "plan", value: "x" },
      },
      { in: { field: "plan", values: [] } },
      { present: {} },
      { all: [] },
      { any: [{ bogus: {} }] },
      { not: { eq: { field: "", value: 1 } } },
    ])
      expect(() => parseRuleSet(rw(when)), JSON.stringify(when)).toThrow(
        ValidonceFormatError,
      );
  });

  test("accepts every condition shape of the format", () => {
    const ok = {
      all: [
        { eq: { field: "a", value: "x" } },
        { ne: { field: "a", value: 1 } },
        { in: { field: "a", values: [true, "y"] } },
        { any: [{ present: { field: "b" } }, { absent: { field: "c" } }] },
        { not: { eq: { field: "d", value: false } } },
      ],
    };
    expect(() => parseRuleSet(rw(ok))).not.toThrow();
  });

  test("rejects an unknown compare op or type, or a right side with both or neither", () => {
    for (const extra of [
      { op: "gte" },
      { type: "time" },
      { right: { field: "start", value: 1 } },
      { right: {} },
      { right: { value: null } },
      { right: { value: true } },
      { right: { value: [1] } },
    ])
      expect(() => parseRuleSet(cmp(extra)), JSON.stringify(extra)).toThrow(
        ValidonceFormatError,
      );
    expect(() =>
      parseRuleSet(cmp({ right: { value: "2024-01-01" } })),
    ).not.toThrow();
    expect(() => parseRuleSet(cmp({ right: { value: 1 } }))).not.toThrow();
  });
});

describe("group kinds", () => {
  const rule = (
    kind: "at_least_one_of" | "exactly_one_of" | "all_or_none",
  ) => ({
    id: "x",
    kind,
    fields: ["a", "b"],
    message: { key: "k" },
  });
  test("report on the first field by default", () => {
    expect(evaluate([rule("at_least_one_of")], {})).toEqual([
      { path: ["a"], ruleId: "x", key: "k", params: {} },
    ]);
  });
  test("exactly_one_of fails when both are given", () => {
    expect(evaluate([rule("exactly_one_of")], { a: 1, b: 2 })).toHaveLength(1);
  });
  test("all_or_none passes when none are given", () => {
    expect(evaluate([rule("all_or_none")], {})).toEqual([]);
  });
});
