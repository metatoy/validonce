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

describe("unimplemented kinds", () => {
  for (const kind of [
    "at_least_one_of",
    "exactly_one_of",
    "all_or_none",
  ] as const) {
    test(`${kind} throws`, () => {
      const rule = { id: "x", kind, fields: ["a", "b"], message: { key: "k" } };
      expect(() => evaluate([rule], {})).toThrow(
        `${kind} is not implemented yet`,
      );
    });
  }
});
