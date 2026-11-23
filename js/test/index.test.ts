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
