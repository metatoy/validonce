// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { Issue, Rule } from "./types";

/** Message catalog: rule message key -> text, with `{param}` placeholders. */
export type Catalog = Record<string, string>;

/**
 * Where to find a rule's kind from an issue's `ruleId`: the rules themselves
 * (an array or a RuleSet), or a plain `ruleId -> kind` map.
 */
export type RuleKinds =
  | readonly Rule[]
  | { readonly rules: readonly Rule[] }
  | Readonly<Record<string, string>>;

/**
 * Default English text per rule kind, used when the catalog has no entry for
 * an issue's key. Rule data carries no field labels, so these stay generic.
 */
export const defaultMessages: Readonly<Record<string, string>> = {
  required_when: "This field is required.",
  compare: "This value is not allowed here.",
  at_least_one_of: "Fill in at least one of these fields.",
  exactly_one_of: "Fill in exactly one of these fields.",
  all_or_none: "Fill in all of these fields, or none.",
};

function kindOf(
  ruleId: string,
  rules: RuleKinds | undefined,
): string | undefined {
  if (rules === undefined) return undefined;
  const list: readonly unknown[] | undefined = Array.isArray(rules)
    ? rules
    : Array.isArray((rules as { rules?: unknown }).rules)
      ? (rules as { rules: readonly unknown[] }).rules
      : undefined;
  if (list) {
    for (const r of list) {
      const rule = r as { id?: unknown; kind?: unknown };
      if (rule.id === ruleId && typeof rule.kind === "string") return rule.kind;
    }
    return undefined;
  }
  const map = rules as Record<string, string>;
  return Object.hasOwn(map, ruleId) ? map[ruleId] : undefined;
}

function interpolate(
  template: string,
  params: Record<string, unknown>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}

/**
 * The text for one issue.
 *
 * 1. `catalog[issue.key]`, with `{param}` filled from `issue.params`
 *    (a placeholder with no param is left as written).
 * 2. Else, when `rules` identifies the issue's rule, the default message for
 *    its kind (`defaultMessages`).
 * 3. Else the key itself, so an unknown issue is never blank.
 *
 * `withRules` and `fieldErrorsFromIssues` both call this, so they give the
 * same text for the same issue (pass the same `rules` to both).
 */
export function formatMessage(
  issue: Pick<Issue, "ruleId" | "key" | "params">,
  catalog?: Catalog,
  rules?: RuleKinds,
): string {
  if (catalog && Object.hasOwn(catalog, issue.key)) {
    return interpolate(catalog[issue.key] as string, issue.params);
  }
  const kind = kindOf(issue.ruleId, rules);
  if (kind !== undefined && Object.hasOwn(defaultMessages, kind)) {
    return defaultMessages[kind] as string;
  }
  return issue.key;
}
