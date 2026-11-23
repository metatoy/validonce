// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { CompareRule, Condition, Issue, Rule, Scalar } from "./types";

type Data = Record<string, unknown>;

function isBlank(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    v === "" ||
    (Array.isArray(v) && v.length === 0)
  );
}

function get(data: Data, field: string): unknown {
  return Object.hasOwn(data, field) ? data[field] : undefined;
}

function strictEq(a: unknown, b: Scalar): boolean {
  return (
    (typeof a === "string" ||
      typeof a === "number" ||
      typeof a === "boolean") &&
    typeof a === typeof b &&
    a === b
  );
}

function evalCondition(c: Condition, data: Data): boolean {
  if ("eq" in c) return strictEq(get(data, c.eq.field), c.eq.value);
  if ("ne" in c) return !strictEq(get(data, c.ne.field), c.ne.value);
  if ("in" in c) {
    const v = get(data, c.in.field);
    return c.in.values.some((x) => strictEq(v, x));
  }
  if ("present" in c) return !isBlank(get(data, c.present.field));
  if ("absent" in c) return isBlank(get(data, c.absent.field));
  if ("all" in c) return c.all.every((x) => evalCondition(x, data));
  if ("any" in c) return c.any.some((x) => evalCondition(x, data));
  return !evalCondition(c.not, data);
}

function daysIn(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function validDate(y: number, m: number, d: number): boolean {
  return (
    y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m)
  );
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

/** Sortable key for a date, or null if invalid. */
function parseDate(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = DATE_RE.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return validDate(y, mo, d) ? y * 10000 + mo * 100 + d : null;
}

/** Instant in epoch milliseconds, or null if invalid. */
function parseDateTime(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = DATETIME_RE.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i]));
  if (!validDate(y as number, mo as number, d as number)) return null;
  if ((h as number) > 23 || (mi as number) > 59 || (s as number) > 59)
    return null;
  const ms = Number(`${m[7] ?? ""}000`.slice(0, 3));
  let offset = 0;
  const z = m[8] as string;
  if (z !== "Z") {
    const oh = Number(z.slice(1, 3));
    const om = Number(z.slice(4, 6));
    if (oh > 23 || om > 59) return null;
    offset = (z[0] === "-" ? -1 : 1) * (oh * 60 + om) * 60000;
  }
  const dt = new Date(0);
  dt.setUTCFullYear(y as number, (mo as number) - 1, d as number);
  dt.setUTCHours(h as number, mi as number, s as number, ms);
  return dt.getTime() - offset;
}

function cmpCodePoints(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = (x[i] as string).codePointAt(0) as number;
    const q = (y[i] as string).codePointAt(0) as number;
    if (p !== q) return p < q ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

/** Returns a comparable value, or null if the type check fails. */
function typed(type: CompareRule["type"], v: unknown): number | string | null {
  switch (type) {
    case "number":
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    case "string":
      return typeof v === "string" ? v : null;
    case "date":
      return parseDate(v);
    case "datetime":
      return parseDateTime(v);
  }
}

function compareFails(rule: CompareRule, data: Data): boolean {
  const l = get(data, rule.left.field);
  const r =
    "field" in rule.right ? get(data, rule.right.field) : rule.right.value;
  if (isBlank(l) || isBlank(r)) return false;
  const a = typed(rule.type, l);
  const b = typed(rule.type, r);
  if (a === null || b === null) return false;
  const c =
    typeof a === "string" && typeof b === "string"
      ? cmpCodePoints(a, b)
      : (a as number) < (b as number)
        ? -1
        : (a as number) > (b as number)
          ? 1
          : 0;
  switch (rule.op) {
    case "lt":
      return !(c < 0);
    case "le":
      return !(c <= 0);
    case "gt":
      return !(c > 0);
    case "ge":
      return !(c >= 0);
    case "eq":
      return c !== 0;
    case "ne":
      return c === 0;
  }
}

export function evaluate(
  rules: readonly Rule[],
  data: Record<string, unknown>,
  options?: { side?: "server" | "client" },
): Issue[] {
  const side = options?.side ?? "server";
  const issues: Issue[] = [];
  for (const rule of rules) {
    if (side === "client" && rule.server_only === true) continue;
    let failed: boolean;
    let defaultPath: string;
    if (rule.kind === "required_when") {
      failed = evalCondition(rule.when, data) && isBlank(get(data, rule.field));
      defaultPath = rule.field;
    } else if (rule.kind === "compare") {
      failed = compareFails(rule, data);
      defaultPath = rule.left.field;
    } else {
      throw new Error(`${(rule as Rule).kind} is not implemented yet`);
    }
    if (failed) {
      issues.push({
        path: [rule.path ?? defaultPath],
        ruleId: rule.id,
        key: rule.message.key,
        params: { ...(rule.message.params ?? {}) },
      });
    }
  }
  return issues;
}
