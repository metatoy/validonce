// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { Condition, Rule } from "./types";

type RulesLike = readonly Rule[] | { readonly rules: readonly Rule[] };

function conditionFields(c: Condition, out: Set<string>): void {
  if ("eq" in c) out.add(c.eq.field);
  else if ("ne" in c) out.add(c.ne.field);
  else if ("in" in c) out.add(c.in.field);
  else if ("present" in c) out.add(c.present.field);
  else if ("absent" in c) out.add(c.absent.field);
  else if ("all" in c) for (const x of c.all) conditionFields(x, out);
  else if ("any" in c) for (const x of c.any) conditionFields(x, out);
  else if ("not" in c) conditionFields(c.not, out);
}

/** The fields a rule reads, and the field its error is reported on. */
function readsAndPath(rule: Rule): { reads: Set<string>; path: string } {
  const reads = new Set<string>();
  let path: string;
  if (rule.kind === "required_when") {
    reads.add(rule.field);
    conditionFields(rule.when, reads);
    path = rule.field;
  } else if (rule.kind === "compare") {
    reads.add(rule.left.field);
    if ("field" in rule.right) reads.add(rule.right.field);
    path = rule.left.field;
  } else {
    for (const f of rule.fields) reads.add(f);
    path = rule.fields[0] ?? "";
  }
  return { reads, path: rule.path ?? path };
}

/**
 * For each field, the OTHER fields whose errors must be re-checked when it
 * changes: the reported path of every rule that reads the field.
 *
 * - `required_when` (plan = "pro" -> company): changing `plan` re-checks `company`.
 * - `compare` (end >= start, reported on `end`): changing `start` re-checks `end`.
 * - group rules (reported on the first field): every other member re-checks it.
 *
 * Server-only rules are skipped (the client never evaluates them). A field
 * never lists itself. Keys and values are sorted, so output is deterministic.
 */
export function dependentFields(rules: RulesLike): Record<string, string[]> {
  const list = Array.isArray(rules)
    ? (rules as readonly Rule[])
    : (rules as { rules: readonly Rule[] }).rules;
  const acc = new Map<string, Set<string>>();
  for (const rule of list) {
    if (rule.server_only) continue;
    const { reads, path } = readsAndPath(rule);
    for (const field of reads) {
      if (field === path) continue;
      const set = acc.get(field) ?? new Set<string>();
      set.add(path);
      acc.set(field, set);
    }
  }
  const out: Record<string, string[]> = {};
  for (const field of [...acc.keys()].sort()) {
    out[field] = [...(acc.get(field) as Set<string>)].sort();
  }
  return out;
}

/**
 * `register` options for one field: `{ deps: [...] }`, or `{}` when nothing
 * depends on it. Spread into `register`:
 *
 *   const deps = registerDeps(rules);
 *   <input {...register("plan", { ...deps("plan") })} />
 */
export function registerDeps(
  rules: RulesLike,
): (name: string) => { deps?: string[] } {
  const map = dependentFields(rules);
  return (name) => {
    const d = Object.hasOwn(map, name) ? map[name] : undefined;
    return d ? { deps: [...d] } : {};
  };
}
