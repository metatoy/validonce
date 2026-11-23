// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { Condition, Rule } from "./types";

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

/** Every field name a rule reads or reports on. */
export function ruleFields(rule: Rule): string[] {
  const out = new Set<string>();
  if (rule.kind === "required_when") {
    out.add(rule.field);
    conditionFields(rule.when, out);
  } else if (rule.kind === "compare") {
    out.add(rule.left.field);
    if ("field" in rule.right) out.add(rule.right.field);
  } else {
    for (const f of rule.fields) out.add(f);
  }
  return [...out];
}
