// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

export type Scalar = string | number | boolean;

export interface RuleMessage {
  key: string;
  params?: Record<string, string | number | boolean | null>;
}

export type Condition =
  | { eq: { field: string; value: Scalar } }
  | { ne: { field: string; value: Scalar } }
  | { in: { field: string; values: Scalar[] } }
  | { present: { field: string } }
  | { absent: { field: string } }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export type CompareOp = "lt" | "le" | "gt" | "ge" | "eq" | "ne";
export type CompareType = "number" | "string" | "date" | "datetime";

interface RuleBase {
  id: string;
  path?: string;
  message: RuleMessage;
  server_only?: boolean;
}

export interface RequiredWhenRule extends RuleBase {
  kind: "required_when";
  field: string;
  when: Condition;
}

export interface CompareRule extends RuleBase {
  kind: "compare";
  left: { field: string };
  op: CompareOp;
  right: { field: string } | { value: string | number };
  type: CompareType;
}

export interface FieldsRule extends RuleBase {
  kind: "at_least_one_of" | "exactly_one_of" | "all_or_none";
  fields: string[];
}

export type Rule = RequiredWhenRule | CompareRule | FieldsRule;

export interface RuleSet {
  version: 1;
  rules: Rule[];
}

export interface Issue {
  path: string[];
  ruleId: string;
  key: string;
  params: Record<string, unknown>;
}

export class ValidonceFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidonceFormatError";
  }
}
