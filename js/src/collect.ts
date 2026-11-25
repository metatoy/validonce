// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { allRulesFromOpenApi } from "./openapi";
import type { RuleSet } from "./types";

export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, sortKeys(o[k])]),
    );
  }
  return v;
}

/** `Name-Input` is reported as `Name` unless a plain `Name` already exists. */
export function collect(
  doc: unknown,
  wanted: string[],
): Record<string, RuleSet> {
  const all = allRulesFromOpenApi(doc);
  const named: Record<string, RuleSet> = {};
  for (const [name, rs] of Object.entries(all)) {
    const plain = name.endsWith("-Input") ? name.slice(0, -6) : name;
    named[plain !== name && !Object.hasOwn(all, plain) ? plain : name] = rs;
  }
  if (wanted.length === 0) return named;
  const out: Record<string, RuleSet> = {};
  for (const w of wanted)
    if (Object.hasOwn(named, w)) out[w] = named[w] as RuleSet;
  return out;
}
