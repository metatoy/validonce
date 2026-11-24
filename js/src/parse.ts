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

const OPS = ["lt", "le", "gt", "ge", "eq", "ne"];
const TYPES = ["number", "string", "date", "datetime"];
const isScalar = (v: unknown) =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean";
const isField = (v: unknown) => typeof v === "string" && v !== "";
// A compare constant is a string or a number (the schema and the C# parser allow nothing else).
const isConstant = (v: unknown) =>
  typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

// Conditions are checked here, like the C# parser does, so a malformed one is a format error at parse time and
// never a crash inside evaluate(). Shapes: rule-format-v1 "Conditions".
function checkCondition(c: unknown, where: string): void {
  if (!isObject(c) || Object.keys(c).length !== 1)
    throw new ValidonceFormatError(
      `${where} must be an object with exactly one key (eq, ne, in, present, absent, all, any, not)`,
    );
  const [op, body] = Object.entries(c)[0] as [string, unknown];
  const b = isObject(body) ? body : undefined;
  switch (op) {
    case "eq":
    case "ne":
      if (!b || !isField(b.field) || !isScalar(b.value))
        throw new ValidonceFormatError(
          `${where}.${op} needs field and a string, number or boolean value`,
        );
      return;
    case "in":
      if (
        !b ||
        !isField(b.field) ||
        !Array.isArray(b.values) ||
        b.values.length === 0 ||
        !b.values.every(isScalar)
      )
        throw new ValidonceFormatError(
          `${where}.in needs field and a non-empty values array of scalars`,
        );
      return;
    case "present":
    case "absent":
      if (!b || !isField(b.field))
        throw new ValidonceFormatError(`${where}.${op} needs field`);
      return;
    case "all":
    case "any":
      if (!Array.isArray(body) || body.length === 0)
        throw new ValidonceFormatError(
          `${where}.${op} needs a non-empty array of conditions`,
        );
      body.forEach((x, j) => {
        checkCondition(x, `${where}.${op}[${j}]`);
      });
      return;
    case "not":
      checkCondition(body, `${where}.not`);
      return;
    default:
      throw new ValidonceFormatError(`${where}: unknown condition "${op}"`);
  }
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
      checkCondition(r.when, `rules[${i}].when`);
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
      if (!OPS.includes(r.op))
        throw new ValidonceFormatError(`rules[${i}].op is unknown`);
      if (!TYPES.includes(r.type))
        throw new ValidonceFormatError(`rules[${i}].type is unknown`);
      const right = r.right;
      if (
        !(
          Object.keys(right).length === 1 &&
          (isField(right.field) ||
            ("value" in right && isConstant(right.value)))
        )
      )
        throw new ValidonceFormatError(
          `rules[${i}].right needs exactly one of field or a string/number value`,
        );
    } else if (!Array.isArray(r.fields) || r.fields.length < 2) {
      throw new ValidonceFormatError(
        `rules[${i}].fields needs 2 or more items`,
      );
    }
  });
  return { version: 1, rules: value.rules as Rule[] };
}
