// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { z } from "zod";
import { evaluate } from "./evaluate";
import { ruleFields } from "./fields";
import { type Catalog, formatMessage } from "./messages";
import type { Rule } from "./types";

export interface WithRulesOptions {
  /**
   * Message catalog: rule message key -> text. `{name}` placeholders are
   * replaced from the issue params. A key with no entry falls back to the
   * default message for the rule's kind (see `formatMessage`).
   */
  messages?: Catalog;
}

/** The ruleId, key and params carried on every Zod issue made by a rule. */
export interface ValidonceIssueParams {
  validonce: true;
  ruleId: string;
  key: string;
  params: Record<string, unknown>;
}

/**
 * Attach validonce rules to a Zod 4 object schema (client side: rules marked
 * `server_only` are skipped).
 *
 * Zod 4 skips `.refine()` / `.superRefine()` on an object when any child field
 * fails. This check is built with `when: () => true`, so the rules still run.
 * Because they run after a child failure, they evaluate the RAW input value
 * (not the parsed output): a field that failed its type check is still seen by
 * the rules, and the evaluator passes on type mismatches by itself.
 *
 * Each issue is `{ code: "custom", path, message, params: { validonce: true,
 * ruleId, key, params } }`; Zod keeps `params` on the issue and through the
 * Standard Schema interface.
 */
export function withRules<T extends z.ZodObject>(
  schema: T,
  rules: readonly Rule[] | { rules: readonly Rule[] },
  options?: WithRulesOptions,
): T {
  const list: readonly Rule[] = Array.isArray(rules)
    ? rules
    : (rules as { rules: readonly Rule[] }).rules;
  const known = new Set(Object.keys(schema.shape));
  for (const rule of list) {
    for (const field of ruleFields(rule)) {
      if (!known.has(field)) {
        throw new Error(
          `validonce: rule "${rule.id}" refers to field "${field}", which is not in the Zod schema (known fields: ${[...known].join(", ")})`,
        );
      }
    }
  }
  const check = new z.core.$ZodCheck({ check: "custom", when: () => true });
  check._zod.check = (payload) => {
    const value: unknown = payload.value;
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return;
    for (const issue of evaluate(list, value as Record<string, unknown>, {
      side: "client",
    })) {
      const params: ValidonceIssueParams = {
        validonce: true,
        ruleId: issue.ruleId,
        key: issue.key,
        params: issue.params,
      };
      payload.issues.push({
        code: "custom",
        path: issue.path,
        message: formatMessage(issue, options?.messages, list),
        input: value,
        params,
      });
    }
  };
  return schema.check(check) as T;
}
