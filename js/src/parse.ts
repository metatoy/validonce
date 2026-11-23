// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { type Rule, type RuleSet, ValidonceFormatError } from "./types";

const KINDS = [
  "required_when",
  "compare",
  "at_least_one_of",
  "exactly_one_of",
  "all_or_none",
];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseRuleSet(value: unknown): RuleSet {
  if (!isObject(value))
    throw new ValidonceFormatError("x-validonce must be an object");
  if (value.version !== 1) {
    throw new ValidonceFormatError(
      `unsupported version: ${String(value.version)}`,
    );
  }
  if (!Array.isArray(value.rules))
    throw new ValidonceFormatError("rules must be an array");
  value.rules.forEach((r: unknown, i: number) => {
    if (!isObject(r))
      throw new ValidonceFormatError(`rules[${i}] must be an object`);
    if (typeof r.id !== "string" || r.id === "") {
      throw new ValidonceFormatError(
        `rules[${i}].id must be a non-empty string`,
      );
    }
    if (typeof r.kind !== "string" || !KINDS.includes(r.kind)) {
      throw new ValidonceFormatError(`rules[${i}].kind is unknown`);
    }
    if (!isObject(r.message) || typeof r.message.key !== "string") {
      throw new ValidonceFormatError(
        `rules[${i}].message.key must be a string`,
      );
    }
    if (r.kind === "required_when") {
      if (typeof r.field !== "string" || !isObject(r.when)) {
        throw new ValidonceFormatError(`rules[${i}] needs field and when`);
      }
    } else if (r.kind === "compare") {
      if (
        !isObject(r.left) ||
        typeof r.left.field !== "string" ||
        !isObject(r.right) ||
        typeof r.op !== "string" ||
        typeof r.type !== "string"
      ) {
        throw new ValidonceFormatError(
          `rules[${i}] needs left, op, right and type`,
        );
      }
    } else if (!Array.isArray(r.fields) || r.fields.length < 2) {
      throw new ValidonceFormatError(
        `rules[${i}].fields needs 2 or more items`,
      );
    }
  });
  return { version: 1, rules: value.rules as Rule[] };
}
