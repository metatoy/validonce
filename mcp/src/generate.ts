// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Boundary-biased, deterministic input generation (wire-form JSON) for the differential check.
// Order of the output: blank/non-blank matrix, conformance seeds, then `count` random inputs.

import fc from "fast-check";
import {
  type Condition,
  type Rule,
  ValidonceFormatError,
  parseRuleSet,
} from "validonce";
import compareSuite from "../../conformance/rules/compare.json";
import edgeSuite from "../../conformance/rules/edge.json";
import groupsSuite from "../../conformance/rules/groups.json";
import requiredWhenSuite from "../../conformance/rules/required_when.json";
import { fieldsOf } from "./rules";
import { ToolError } from "./sdk";

export const MAX_COUNT = 50_000;
export const DEFAULT_COUNT = 10_000;

const MISSING = Symbol("missing");
type V = unknown;
type Rec = Record<string, V>;
type FType = "number" | "string" | "date" | "datetime" | "boolean" | "array" | "unknown";

const BLANKS: V[] = [MISSING, null, "", []];
const NEAR: V[] = [" ", 0, false, {}];

interface FieldInfo {
  name: string;
  type: FType;
  consts: Array<string | number | boolean>;
}

export interface GenerateOptions {
  rules: unknown;
  properties?: Record<string, unknown>;
  seed: number;
  count: number;
  includeInvalid?: boolean;
}

export interface Generated {
  inputs: Rec[];
  matrixSize: number;
  seedCount: number;
  randomCount: number;
  fields: Array<{ name: string; type: FType }>;
}

// ---------- helpers ----------

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const pick = <T>(a: readonly T[], n: number): T => a[n % a.length] as T;

function dateMs(s: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const d = new Date(0);
  d.setUTCFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = d.getTime();
  return Number.isNaN(t) ? undefined : t;
}

function dateStr(ms: number): string | undefined {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  if (Number.isNaN(ms) || y < 1 || y > 9999) return undefined;
  return `${pad(y, 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

const OFFSETS: Array<[string, number]> = [
  ["Z", 0],
  ["+00:00", 0],
  ["-00:00", 0],
  ["+01:00", 60],
  ["-05:30", -330],
  ["+14:00", 840],
  ["-12:00", -720],
];

function dtStr(ms: number, off: [string, number], extraDigit: boolean): string | undefined {
  const local = new Date(ms + off[1] * 60_000);
  const d = dateStr(local.getTime());
  if (d === undefined) return undefined;
  const msPart = ((ms % 1000) + 1000) % 1000;
  const frac = extraDigit ? `.${pad(msPart, 3)}9` : msPart ? `.${pad(msPart, 3)}` : "";
  return `${d}T${pad(local.getUTCHours(), 2)}:${pad(local.getUTCMinutes(), 2)}:${pad(local.getUTCSeconds(), 2)}${frac}${off[0]}`;
}

function validFor(type: FType, v: V): boolean {
  switch (type) {
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "string":
      return typeof v === "string" && v !== "";
    case "date":
      return typeof v === "string" && dateMs(v) !== undefined;
    case "datetime":
      return typeof v === "string" && /T.*(Z|[+-]\d\d:\d\d)$/.test(v) && !Number.isNaN(Date.parse(v));
    default:
      return false;
  }
}

function swapCase(s: string): string {
  return Array.from(s)
    .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
    .join("");
}

/** A value related to `base` (equal, ±1 unit, case, offsets, ...), chosen by `n`. */
function derive(type: FType, base: V, n: number): V | undefined {
  const a = n % 997;
  const b = Math.floor(n / 997);
  if (type === "number" && typeof base === "number") {
    return base + pick([0, 1, -1, 0.5, -0.5], a);
  }
  if (type === "string" && typeof base === "string") {
    const cps = Array.from(base.length ? base : "a");
    const s = cps.join("");
    const last = cps[cps.length - 1] as string;
    const lc = last.codePointAt(0) as number;
    const body = cps.slice(0, -1).join("");
    const bump = (d: number) => {
      const c = lc + d;
      return c <= 0 || (c >= 0xd800 && c <= 0xdfff) || c > 0x10ffff ? s : body + String.fromCodePoint(c);
    };
    return pick(
      [s, `${s}a`, body, swapCase(s), `${s} `, bump(1), bump(-1), `${body}😀`, `${body}\uFFFF`],
      a,
    );
  }
  if (type === "date" && typeof base === "string") {
    const t = dateMs(base);
    if (t === undefined) return undefined;
    return dateStr(t + pick([0, 0, 1, -1, 30, 31, 365, 366, -366, -31], a) * 86_400_000);
  }
  if (type === "datetime" && typeof base === "string") {
    const t = Date.parse(base);
    if (Number.isNaN(t)) return undefined;
    const delta = pick([0, 0, 0, 1000, -1000, 1, -1, 60_000, -60_000, 3_600_000, -3_600_000, 86_400_000], a);
    return dtStr(t + delta, pick(OFFSETS, b), b % 5 === 0);
  }
  return undefined;
}

function nearMiss(v: string | number | boolean, m: number, invalid: boolean): V {
  let opts: V[] = [];
  if (typeof v === "string") {
    opts = [v.toUpperCase(), v.toLowerCase(), swapCase(v), `${v} `, ` ${v}`, v.slice(0, -1), `${v}\u00a0`];
    if (invalid && v.trim() !== "" && !Number.isNaN(Number(v))) opts.push(Number(v));
  } else if (typeof v === "number") {
    opts = [v + 1, v - 1, v + 0.5, -v];
    if (invalid) opts.push(String(v));
  } else {
    opts = [!v];
    if (invalid) opts.push(String(v));
  }
  opts = opts.filter((x) => x !== v);
  return opts.length ? pick(opts, m) : v;
}

// ---------- field model ----------

function schemaType(prop: unknown): FType | undefined {
  const p = (prop ?? {}) as { type?: unknown; format?: unknown };
  const ts = (Array.isArray(p.type) ? p.type : [p.type]).filter((x) => typeof x === "string" && x !== "null");
  if (p.format === "date" && ts.includes("string")) return "date";
  if (p.format === "date-time" && ts.includes("string")) return "datetime";
  if (ts.includes("integer") || ts.includes("number")) return "number";
  if (ts.includes("string")) return "string";
  if (ts.includes("boolean")) return "boolean";
  if (ts.includes("array")) return "array";
  return undefined;
}

function conditionAtoms(c: Condition, out: Atom[]): void {
  if ("eq" in c) out.push({ field: c.eq.field, kind: "eq", values: [c.eq.value] });
  else if ("ne" in c) out.push({ field: c.ne.field, kind: "ne", values: [c.ne.value] });
  else if ("in" in c) out.push({ field: c.in.field, kind: "in", values: c.in.values });
  else if ("present" in c) out.push({ field: c.present.field, kind: "present", values: [] });
  else if ("absent" in c) out.push({ field: c.absent.field, kind: "absent", values: [] });
  else if ("all" in c) for (const x of c.all) conditionAtoms(x, out);
  else if ("any" in c) for (const x of c.any) conditionAtoms(x, out);
  else if ("not" in c) conditionAtoms(c.not, out);
}

interface Atom {
  field: string;
  kind: "eq" | "ne" | "in" | "present" | "absent";
  values: Array<string | number | boolean>;
}

function buildFields(rules: readonly Rule[], properties: Record<string, unknown> | undefined): FieldInfo[] {
  const map = new Map<string, FieldInfo>();
  const get = (name: string): FieldInfo => {
    let f = map.get(name);
    if (!f) {
      f = { name, type: "unknown", consts: [] };
      map.set(name, f);
    }
    return f;
  };
  const addConst = (f: FieldInfo, v: string | number | boolean) => {
    if (!f.consts.some((x) => x === v)) f.consts.push(v);
  };
  const fromCompare = new Map<string, FType>();
  for (const r of rules) {
    for (const name of fieldsOf(r)) get(name);
    if (r.kind === "compare") {
      fromCompare.set(r.left.field, r.type);
      if ("field" in r.right) fromCompare.set(r.right.field, r.type);
      else addConst(get(r.left.field), r.right.value);
    } else if (r.kind === "required_when") {
      const atoms: Atom[] = [];
      conditionAtoms(r.when, atoms);
      for (const a of atoms) for (const v of a.values) addConst(get(a.field), v);
    }
  }
  for (const f of map.values()) {
    const prop = properties && Object.hasOwn(properties, f.name) ? properties[f.name] : undefined;
    f.type =
      fromCompare.get(f.name) ??
      schemaType(prop) ??
      (f.consts[0] !== undefined ? (typeof f.consts[0] as FType) : "string");
  }
  return [...map.values()];
}

function typedPool(f: FieldInfo, invalid: boolean): V[] {
  const out: V[] = [];
  switch (f.type) {
    case "number":
      out.push(0, 1, -1, 2, 10, 0.5, 1.5, 100, 2147483647, -2147483648);
      for (const c of f.consts) if (typeof c === "number") out.push(c, c + 1, c - 1);
      if (invalid) out.push("1", "0", "abc", true);
      break;
    case "string":
      out.push("a", "A", "b", "pro", "Pro", "PRO", "pro ", "free", "é", "e\u0301", "😀", "\uFF5E", "\uFFFF", "0", "true");
      for (const c of f.consts) if (typeof c === "string") out.push(c, c.toUpperCase(), `${c} `);
      if (invalid) out.push(1, true);
      break;
    case "date":
      out.push("0001-01-01", "9999-12-31", "2024-02-29", "2023-02-28", "2024-12-31", "2025-01-01", "2000-01-01", "2024-06-15");
      for (const c of f.consts) if (typeof c === "string") out.push(c);
      if (invalid) out.push("2023-02-29", "2024-13-01", "2024-00-10", "24-01-01", "2024-1-1", "not a date", "2024-01-01T00:00:00Z", 20240101);
      break;
    case "datetime":
      out.push(
        "2024-06-15T12:00:00Z", "2024-06-15T12:00:00+00:00", "2024-06-15T13:00:00+01:00",
        "2024-06-15T12:00:00.123Z", "2024-06-15T12:00:00.1239Z", "2024-06-15T12:00:00.1231Z",
        "2024-12-31T23:59:59Z", "2025-01-01T00:00:00Z", "2024-02-29T00:00:00-05:30",
        "0001-01-01T00:00:00Z", "9999-12-31T23:59:59Z",
      );
      for (const c of f.consts) if (typeof c === "string") out.push(c);
      if (invalid) out.push("2024-06-15T12:00:00", "2024-06-15t12:00:00z", "2024-06-15 12:00:00Z", "2024-06-15T24:00:00Z", "2024-06-15");
      break;
    case "boolean":
      out.push(true, false);
      break;
    case "array":
      out.push([1], ["a"], [null]);
      break;
    default:
      out.push("a", 1, true);
  }
  return out;
}

const typicals = (f: FieldInfo): V[] => {
  const base: V[] = (() => {
    switch (f.type) {
      case "number": return [10, 3];
      case "date": return ["2024-06-15", "2024-01-01"];
      case "datetime": return ["2024-06-15T12:00:00Z", "2024-01-01T00:00:00Z"];
      case "boolean": return [true, false];
      case "array": return [[1]];
      default: return ["x", "y"];
    }
  })();
  // consts first: a rule's condition value is the non-blank value that matters most
  const consts = f.consts.slice(0, 2);
  const all: V[] = [...consts, ...base];
  const seen = new Set<string>();
  return all.filter((v) => !seen.has(JSON.stringify(v)) && seen.add(JSON.stringify(v))).slice(0, 4);
};

function randomTyped(f: FieldInfo): fc.Arbitrary<V> {
  switch (f.type) {
    case "number":
      return fc.integer({ min: -4000, max: 4000 }).map((x) => x / 4);
    case "date":
      return fc.integer({ min: -3000, max: 3000 }).map((d) => dateStr(Date.UTC(2020, 0, 1) + d * 86_400_000) as string);
    case "datetime":
      return fc
        .tuple(fc.integer({ min: -2_000_000, max: 2_000_000 }), fc.integer({ min: 0, max: OFFSETS.length - 1 }))
        .map(([s, o]) => dtStr(Date.UTC(2024, 5, 15) + s * 1000, OFFSETS[o] as [string, number], false) as string);
    case "boolean":
      return fc.boolean();
    case "array":
      return fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 3 });
    default:
      return fc.string({ maxLength: 6 });
  }
}

// ---------- matrix ----------

function productRecords(names: string[], states: V[][]): Rec[] {
  const total = states.reduce((a, s) => a * s.length, 1);
  const out: Rec[] = [];
  for (let i = 0; i < total; i++) {
    let r = i;
    const rec: Rec = {};
    names.forEach((n, j) => {
      const s = states[j] as V[];
      const v = s[r % s.length];
      r = Math.floor(r / s.length);
      if (v !== MISSING) rec[n] = v;
    });
    out.push(rec);
  }
  return out;
}

const MATRIX_LIMIT = 4000;
const MAX_MATRIX_FIELDS = 8;

function matrixFor(rule: Rule, byName: Map<string, FieldInfo>): Rec[] {
  const names = [...new Set(fieldsOf(rule))].slice(0, MAX_MATRIX_FIELDS);
  const infos = names.map((n) => byName.get(n) as FieldInfo);
  const out: Rec[] = [];
  // blank (missing, null, "", []) × non-blank typicals
  const levels: Array<[number, number]> = [[4, 4], [4, 2], [2, 2], [2, 1], [1, 1]];
  for (const [nb, nn] of levels) {
    const states = infos.map((f) => [...BLANKS.slice(0, nb), ...typicals(f).slice(0, nn)]);
    if (states.reduce((a, s) => a * s.length, 1) <= MATRIX_LIMIT || (nb === 1 && nn === 1)) {
      out.push(...productRecords(names, states));
      break;
    }
  }
  // near-blank non-blanks (" ", 0, false, {}) against a typical value
  for (const n of [5, 3, 2]) {
    const states = infos.map((f) => [typicals(f)[0], ...NEAR].slice(0, n));
    if (states.reduce((a, s) => a * s.length, 1) <= MATRIX_LIMIT || n === 2) {
      out.push(...productRecords(names, states));
      break;
    }
  }
  return out;
}

// ---------- conformance seeds ----------

interface CaseLike { rules?: unknown; data?: unknown }

function conformanceSeeds(rules: readonly Rule[]): Rec[] {
  const cases: CaseLike[] = [];
  for (const s of [compareSuite, edgeSuite, groupsSuite, requiredWhenSuite] as unknown as Array<{ cases?: CaseLike[] }>)
    cases.push(...(s.cases ?? []));
  const out: Rec[] = [];
  for (const rule of rules) {
    const ours = [...new Set(fieldsOf(rule))];
    let taken = 0;
    for (const c of cases) {
      const cr = Array.isArray(c.rules) ? (c.rules as Rule[]) : [];
      const first = cr[0];
      if (!first || cr.length !== 1 || first.kind !== rule.kind) continue;
      if (first.kind === "compare" && rule.kind === "compare" && first.type !== rule.type) continue;
      let theirs: string[];
      try {
        theirs = [...new Set(fieldsOf(first))];
      } catch {
        continue;
      }
      if (theirs.length !== ours.length || typeof c.data !== "object" || c.data === null) continue;
      const rec: Rec = {};
      theirs.forEach((t, i) => {
        const d = c.data as Rec;
        if (Object.hasOwn(d, t)) rec[ours[i] as string] = d[t];
      });
      out.push(rec);
      if (++taken >= 500) break;
    }
  }
  return out;
}

// ---------- coupling ----------

function coupleCompare(rec: Rec, rule: Extract<Rule, { kind: "compare" }>, n: number, f: (n: string) => FieldInfo, invalid: boolean): void {
  if (n % 4 === 0) return;
  const m = Math.floor(n / 4);
  const type = rule.type;
  if ("field" in rule.right) {
    const [src, dst] = m % 2 === 0 ? [rule.right.field, rule.left.field] : [rule.left.field, rule.right.field];
    let v = rec[src];
    if (!validFor(type, v)) {
      const pool = typedPool(f(src), false);
      v = pool[m % pool.length];
      rec[src] = v;
    }
    const d = derive(type, v, Math.floor(m / 2));
    if (d !== undefined) rec[dst] = d;
  } else {
    const d = derive(type, rule.right.value, m);
    if (d !== undefined) rec[rule.left.field] = d;
  }
  void invalid;
}

function coupleRequired(rec: Rec, rule: Extract<Rule, { kind: "required_when" }>, n: number, f: (n: string) => FieldInfo, invalid: boolean): void {
  const mode = n % 6;
  if (mode === 0) return;
  const m = Math.floor(n / 6);
  const atoms: Atom[] = [];
  conditionAtoms(rule.when, atoms);
  if (!atoms.length) return;
  const exactish = atoms.filter((a) => a.kind === "eq" || a.kind === "in");
  const missIdx = exactish.length ? m % exactish.length : -1;
  atoms.forEach((a) => {
    const t = typicals(f(a.field))[0];
    const isMiss = (mode === 3 || mode === 4) && exactish[missIdx] === a;
    if (a.kind === "eq" || a.kind === "in") {
      const v = pick(a.values, m);
      rec[a.field] = isMiss ? nearMiss(v, m, invalid) : v;
    } else if (a.kind === "ne") {
      rec[a.field] = nearMiss(a.values[0] as string | number | boolean, m, invalid);
    } else if (a.kind === "present") rec[a.field] = t;
    else rec[a.field] = pick(BLANKS, m);
  });
  if (mode === 1 || mode === 3) rec[rule.field] = pick(BLANKS, Math.floor(m / 3));
  else if (mode === 2 || mode === 4) rec[rule.field] = typicals(f(rule.field))[0];
}

// ---------- main ----------

export function generateInputs(opts: GenerateOptions): Generated {
  let rules: Rule[];
  try {
    rules = parseRuleSet(opts.rules).rules;
  } catch (e) {
    throw new ToolError(`Invalid rule set: ${e instanceof ValidonceFormatError ? e.message : "unreadable"}`);
  }
  if (!Number.isInteger(opts.count) || opts.count < 0 || opts.count > MAX_COUNT)
    throw new ToolError(`count must be an integer from 0 to ${MAX_COUNT}.`);
  const invalid = opts.includeInvalid === true;
  const fields = buildFields(rules, opts.properties);
  const byName = new Map(fields.map((f) => [f.name, f]));
  const info = (n: string) => byName.get(n) as FieldInfo;

  const seen = new Set<string>();
  const dedupe = (recs: Rec[]): Rec[] =>
    recs.filter((r) => {
      const k = JSON.stringify(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const matrix = dedupe(rules.flatMap((r) => matrixFor(r, byName)));
  const seeds = dedupe(conformanceSeeds(rules));

  // random part: per-field draws + one integer per coupled rule
  const coupled = rules.filter((r) => r.kind === "compare" || r.kind === "required_when");
  const fieldArbs = fields.map((f) => {
    const pool = typedPool(f, false);
    const opts2: Array<{ weight: number; arbitrary: fc.Arbitrary<V> }> = [
      { weight: 3, arbitrary: fc.constantFrom(...BLANKS) },
      { weight: 2, arbitrary: fc.constantFrom(...NEAR) },
      { weight: 6, arbitrary: fc.constantFrom(...pool) },
      { weight: 2, arbitrary: randomTyped(f) },
    ];
    if (invalid) {
      const bad = typedPool(f, true).filter((v) => !pool.some((p) => JSON.stringify(p) === JSON.stringify(v)));
      if (bad.length) opts2.push({ weight: 1, arbitrary: fc.constantFrom(...bad) });
    }
    return fc.oneof(...opts2);
  });
  const slots = fc.array(fc.integer({ min: 0, max: 0x7fffffff }), { minLength: coupled.length, maxLength: coupled.length });
  const arb = fc
    .tuple(fc.tuple(...(fieldArbs as [fc.Arbitrary<V>, ...Array<fc.Arbitrary<V>>])), slots)
    .map(([vals, picks]) => {
      const rec: Rec = {};
      fields.forEach((f, i) => {
        rec[f.name] = vals[i];
      });
      coupled.forEach((r, i) => {
        const n = picks[i] as number;
        if (r.kind === "compare") coupleCompare(rec, r, n, info, invalid);
        else if (r.kind === "required_when") coupleRequired(rec, r, n, info, invalid);
      });
      for (const k of Object.keys(rec)) if (rec[k] === MISSING) delete rec[k];
      return rec;
    });
  const random =
    fields.length === 0
      ? Array.from({ length: opts.count }, () => ({}) as Rec)
      : fc.sample(arb, { seed: opts.seed, numRuns: opts.count });

  return {
    inputs: [...matrix, ...seeds, ...random],
    matrixSize: matrix.length,
    seedCount: seeds.length,
    randomCount: random.length,
    fields: fields.map((f) => ({ name: f.name, type: f.type })),
  };
}
