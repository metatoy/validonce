// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Lines of pretty-printed text, each optionally tagged with a rule id, and the matching of rule ids
// to lines of a backend's source.

export interface Line {
  text: string;
  /** The rule id this line belongs to. */
  tag?: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isPrim = (v: unknown) => v === null || typeof v !== "object";

/**
 * Pretty-print JSON as lines. Arrays of plain values stay on one line. `tagOf` names the rule an
 * object belongs to; every line inside that object carries the tag.
 */
export function prettyLines(value: unknown, tagOf: (o: Obj) => string | undefined): Line[] {
  const out: Line[] = [];
  const walk = (v: unknown, depth: number, prefix: string, comma: string, tag?: string) => {
    const pad = "  ".repeat(depth);
    if (Array.isArray(v)) {
      if (v.every(isPrim)) {
        out.push({ text: `${pad}${prefix}[${v.map((x) => JSON.stringify(x)).join(", ")}]${comma}`, tag });
        return;
      }
      out.push({ text: `${pad}${prefix}[`, tag });
      v.forEach((x, i) => {
        walk(x, depth + 1, "", i < v.length - 1 ? "," : "", tag);
      });
      out.push({ text: `${pad}]${comma}`, tag });
    } else if (isObj(v)) {
      const t = tagOf(v) ?? tag;
      const entries = Object.entries(v);
      if (entries.length === 0) {
        out.push({ text: `${pad}${prefix}{}${comma}`, tag: t });
        return;
      }
      out.push({ text: `${pad}${prefix}{`, tag: t });
      entries.forEach(([k, x], i) => {
        walk(x, depth + 1, `${JSON.stringify(k)}: `, i < entries.length - 1 ? "," : "", t);
      });
      out.push({ text: `${pad}}${comma}`, tag: t });
    } else {
      out.push({ text: `${pad}${prefix}${JSON.stringify(v)}${comma}`, tag });
    }
  };
  walk(value, 0, "", "");
  return out;
}

/** The rule id carried by an x-validonce rule, a 422 issue, or a FastAPI detail entry. */
export function ruleIdOf(o: Obj): string | undefined {
  const ctx = isObj(o.ctx) ? o.ctx : undefined;
  for (const c of [o.ruleId, o.rule, o.id, ctx?.ruleId, ctx?.rule_id]) {
    if (typeof c === "string" && c.startsWith("Contact.")) return c;
    if (typeof c === "string" && c.startsWith("k8s.")) return c;
  }
  return undefined;
}

export type Kind = "at_least_one_of" | "all_or_none" | "required_when" | "compare";
export const KINDS: readonly Kind[] = ["at_least_one_of", "all_or_none", "required_when", "compare"];

// How each kind appears in the sources (names differ per language: AtLeastOneOf, at_least_one_of,
// atLeastOneOf; the rule that requires a field; a comparison).
const STARTS: Record<Kind, RegExp> = {
  at_least_one_of: /at_?least_?one_?of/i,
  all_or_none: /all_?or_?none/i,
  required_when: /require/i,
  compare: /compare|\bCmp\(|\.ge\(/i,
};

const depthDelta = (s: string) => {
  let d = 0;
  for (const ch of s.replace(/"(?:[^"\\]|\\.)*"/g, "")) {
    if (ch === "(" || ch === "{" || ch === "[") d++;
    else if (ch === ")" || ch === "}" || ch === "]") d--;
  }
  return d;
};

/**
 * Line ranges (inclusive) of each rule in a backend's source. The Kubernetes snippet is YAML with one
 * `- rule:` block per rule, in contract order; the others are matched by the rule's call and extended
 * to the closing bracket.
 */
export function ruleRanges(backend: string, code: string): Partial<Record<Kind, [number, number]>> {
  const lines = code.split("\n");
  const out: Partial<Record<Kind, [number, number]>> = {};
  if (backend === "k8s") {
    const starts = lines.flatMap((l, i) => (/^\s*- rule:/.test(l) ? [i] : []));
    starts.forEach((s, n) => {
      const kind = KINDS[n];
      if (kind) out[kind] = [s, (starts[n + 1] ?? lines.length) - 1];
    });
    return out;
  }
  const body = lines.map((l) => l.replace(/(\/\/|#).*$/, ""));
  for (const kind of KINDS) {
    // A rule's call line: matches its name and is not the model/field declaration.
    const start = body.findIndex(
      (l, i) =>
        STARTS[kind].test(l) &&
        /\(/.test(l) &&
        !/^\s*(class|public|record|def)\b/.test(l) &&
        !Object.values(out).some((r) => r && i >= r[0] && i <= r[1]),
    );
    if (start < 0) continue;
    let depth = 0;
    let end = start;
    for (let i = start; i < body.length; i++) {
      depth += depthDelta(body[i] as string);
      end = i;
      if (depth <= 0) break;
    }
    out[kind] = [start, end];
  }
  return out;
}
