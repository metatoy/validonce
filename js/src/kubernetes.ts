// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Kubernetes `x-kubernetes-validations` (CEL) -> `x-validonce`.
//
// Only a small CEL subset is understood (see parseCel). Anything else, and any translation the
// allowlist (TRANSLATIONS / GUARDS) does not permit, is kept as a `server_only` rule with its CEL in
// `message.params.cel`, so nothing is lost and no wrong rule is ever produced.

import type { Catalog } from "./messages";
import { parseRuleSet } from "./parse";
import {
  type CompareOp,
  type CompareType,
  type Condition,
  type Rule,
  type RuleMessage,
  type RuleSet,
  type Scalar,
  ValidonceFormatError,
} from "./types";

// ---------------------------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------------------------

export type RowId =
  | "required_when"
  | "compare.number"
  | "compare.string"
  | "compare.date"
  | "compare.datetime"
  | "at_least_one_of"
  | "exactly_one_of"
  | "all_or_none";

/** `exact`: always translate. `guarded`: translate when the row's guard accepts the fields. `drop`: server_only. */
export type Level = "exact" | "guarded" | "drop";

export const ROW_IDS: readonly RowId[] = [
  "required_when",
  "compare.number",
  "compare.string",
  "compare.date",
  "compare.datetime",
  "at_least_one_of",
  "exactly_one_of",
  "all_or_none",
];

/**
 * Which translation rows are semantically exact against Kubernetes' CEL. Every row is `drop` until the
 * Part 0 spike marks it. The lead edits this table; tests override it through `TranslateContext`.
 */
export const TRANSLATIONS: Record<RowId, Level> = {
  required_when: "drop",
  "compare.number": "drop",
  "compare.string": "drop",
  "compare.date": "drop",
  "compare.datetime": "drop",
  at_least_one_of: "drop",
  exactly_one_of: "drop",
  all_or_none: "drop",
};

/** What the schema says about one field a rule uses. */
export interface FieldInfo {
  name: string;
  /** The field is a declared property of the node. */
  known: boolean;
  /** JSON Schema `type` (the first non-null entry of an array type). */
  type?: string;
  format?: string;
  /** `nullable: true`, or `null` among the types. */
  nullable: boolean;
  /** Listed in the node's `required`. */
  required: boolean;
  minLength?: number;
  minItems?: number;
}

/** `presence`: used through `has()`. `value`: its value is compared (operand, or `== literal`). */
export interface FieldUse {
  field: FieldInfo;
  role: "presence" | "value";
}

/** For a `guarded` row: true when the rule is exact for these fields. */
export type Guard = (uses: readonly FieldUse[]) => boolean;

/**
 * A conservative starting guard: every field is declared and not nullable; compared fields are
 * required (CEL errors on an unset operand where validonce skips the comparison); a field used with
 * `has()` can't be present-but-blank (a string needs `minLength` >= 1, an array `minItems` >= 1).
 */
export const defaultGuard: Guard = (uses) =>
  uses.every(({ field, role }) => {
    if (!field.known || field.nullable) return false;
    if (role === "value") return field.required;
    if (field.type === "string") return (field.minLength ?? 0) >= 1;
    if (field.type === "array") return (field.minItems ?? 0) >= 1;
    return field.type !== undefined;
  });

export const GUARDS: Record<RowId, Guard> = {
  required_when: defaultGuard,
  "compare.number": defaultGuard,
  "compare.string": defaultGuard,
  "compare.date": defaultGuard,
  "compare.datetime": defaultGuard,
  at_least_one_of: defaultGuard,
  exactly_one_of: defaultGuard,
  all_or_none: defaultGuard,
};

// ---------------------------------------------------------------------------------------------
// CEL subset: tokenizer and parser
// ---------------------------------------------------------------------------------------------

type Lit = {
  t: "lit";
  v: string | number | boolean | null;
  num?: "int" | "double";
};

export type CelAst =
  | Lit
  | { t: "field"; name: string }
  | { t: "has"; name: string }
  | { t: "ts"; name: string }
  | { t: "self" }
  | { t: "not"; a: CelAst }
  | { t: "and" | "or"; a: CelAst; b: CelAst }
  | {
      t: "cmp";
      op: "==" | "!=" | "<" | "<=" | ">" | ">=";
      a: CelAst;
      b: CelAst;
    }
  | { t: "in"; a: CelAst; vals: Lit[] }
  | { t: "cond"; c: CelAst; a: CelAst; b: CelAst }
  | { t: "one"; names: string[] }
  | { t: "sum"; terms: CelAst[] };

export type CelResult =
  | { ok: true; ast: CelAst }
  | { ok: false; reason: string };

class Unrecognised extends Error {}
const unrec = (reason: string): never => {
  throw new Unrecognised(reason);
};

interface Tok {
  k: "str" | "int" | "dbl" | "id" | "p" | "end";
  v: string;
}

const ARITHMETIC = ["+", "-", "*", "/", "%"];
const TWO_CHAR = ["==", "!=", "<=", ">=", "&&", "||"];
const ONE_CHAR = "<>!?:()[],.+-*/%";
const ESCAPES: Record<string, string> = {
  "\\": "\\",
  '"': '"',
  "'": "'",
  n: "\n",
  t: "\t",
  r: "\r",
};

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9]/.test(ch)) {
      const m = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(
        src.slice(i),
      ) as RegExpExecArray;
      i += m[0].length;
      if (i < src.length && /[A-Za-z_0-9.]/.test(src[i] as string))
        unrec("unsupported number syntax (unsigned, hex or trailing text)");
      out.push({ k: m[1] || m[2] ? "dbl" : "int", v: m[0] });
    } else if (ch === '"' || ch === "'") {
      i++;
      if (src[i] === ch && src[i + 1] === ch)
        unrec("triple-quoted strings are not supported");
      let s = "";
      for (;;) {
        const c = src[i];
        if (c === undefined || c === "\n") unrec("unterminated string");
        i++;
        if (c === ch) break;
        if (c === "\\") {
          const e = ESCAPES[src[i] ?? ""];
          if (e === undefined) unrec("unsupported string escape");
          s += e;
          i++;
        } else s += c;
      }
      out.push({ k: "str", v: s });
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)) as RegExpExecArray;
      i += m[0].length;
      out.push({ k: "id", v: m[0] });
    } else if (TWO_CHAR.includes(src.slice(i, i + 2))) {
      out.push({ k: "p", v: src.slice(i, i + 2) });
      i += 2;
    } else if (ONE_CHAR.includes(ch)) {
      out.push({ k: "p", v: ch });
      i++;
    } else unrec(`unsupported character '${ch}'`);
  }
  out.push({ k: "end", v: "" });
  return out;
}

const RELOPS = ["==", "!=", "<", "<=", ">", ">="] as const;

class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok {
    return this.toks[this.i] as Tok;
  }
  private next(): Tok {
    const t = this.peek();
    if (t.k !== "end") this.i++;
    return t;
  }
  private isP(v: string): boolean {
    const t = this.peek();
    return t.k === "p" && t.v === v;
  }
  private eatP(v: string): boolean {
    if (!this.isP(v)) return false;
    this.i++;
    return true;
  }
  private fail(): never {
    const t = this.peek();
    if (t.k === "p" && ARITHMETIC.includes(t.v))
      return unrec(`arithmetic operator '${t.v}' is not supported`);
    return unrec(
      t.k === "end" ? "unexpected end of expression" : `unexpected '${t.v}'`,
    );
  }
  private expectP(v: string): void {
    if (!this.eatP(v)) this.fail();
  }
  private ident(): string {
    const t = this.peek();
    if (t.k !== "id") return this.fail();
    this.i++;
    return t.v;
  }

  parse(): CelAst {
    const e = this.expr();
    if (this.peek().k !== "end") this.fail();
    return e;
  }

  private expr(): CelAst {
    const c = this.or();
    if (!this.eatP("?")) return c;
    const a = this.expr();
    this.expectP(":");
    const b = this.expr();
    return { t: "cond", c, a, b };
  }
  private or(): CelAst {
    let a = this.and();
    while (this.eatP("||")) a = { t: "or", a, b: this.and() };
    return a;
  }
  private and(): CelAst {
    let a = this.rel();
    while (this.eatP("&&")) a = { t: "and", a, b: this.rel() };
    return a;
  }
  /** `x + y + …`; only ever recognised as a sum of has() ternaries. */
  private add(): CelAst {
    const first = this.unary();
    if (!this.isP("+")) return first;
    const terms = [first];
    while (this.eatP("+")) terms.push(this.unary());
    return { t: "sum", terms };
  }
  private rel(): CelAst {
    const a = this.add();
    const t = this.peek();
    if (t.k === "p" && (RELOPS as readonly string[]).includes(t.v)) {
      this.i++;
      return {
        t: "cmp",
        op: t.v as (typeof RELOPS)[number],
        a,
        b: this.add(),
      };
    }
    if (t.k === "id" && t.v === "in") {
      this.i++;
      this.expectP("[");
      const vals: Lit[] = [];
      while (!this.isP("]")) {
        vals.push(this.literal());
        if (!this.eatP(",")) break;
      }
      this.expectP("]");
      if (vals.length === 0) unrec("'in' with an empty list");
      return { t: "in", a, vals };
    }
    return a;
  }
  private unary(): CelAst {
    if (this.eatP("!")) return { t: "not", a: this.unary() };
    return this.primary();
  }

  private literal(): Lit {
    const neg = this.isP("-");
    if (neg) this.i++;
    const t = this.next();
    if (t.k === "int" || t.k === "dbl") {
      const n = Number(neg ? `-${t.v}` : t.v);
      if (t.k === "int" && !Number.isSafeInteger(n))
        unrec("integer literal outside the exactly representable range");
      return { t: "lit", v: n, num: t.k === "int" ? "int" : "double" };
    }
    if (neg) return this.failBack();
    if (t.k === "str") return { t: "lit", v: t.v };
    if (t.k === "id" && (t.v === "true" || t.v === "false"))
      return { t: "lit", v: t.v === "true" };
    if (t.k === "id" && t.v === "null") return { t: "lit", v: null };
    return unrec("expected a literal");
  }
  private failBack(): never {
    this.i--;
    return unrec("arithmetic operator '-' is not supported");
  }

  /** After `self`: `.field`, and nothing deeper. */
  private selfField(): string {
    if (!this.eatP(".")) return unrec("bare 'self' is not supported");
    const name = this.ident();
    if (this.isP(".") || this.isP("["))
      unrec(
        `path or method call after self.${name} (only self.<field> is supported)`,
      );
    return name;
  }

  private primary(): CelAst {
    const t = this.peek();
    if (t.k === "str" || t.k === "int" || t.k === "dbl" || this.isP("-"))
      return this.literal();
    if (this.eatP("(")) {
      const e = this.expr();
      this.expectP(")");
      return e;
    }
    if (this.eatP("[")) return this.existsOne();
    if (t.k !== "id") return this.fail();
    this.i++;
    switch (t.v) {
      case "true":
      case "false":
      case "null":
        this.i--;
        return this.literal();
      case "self":
        if (!this.isP(".")) return { t: "self" };
        return { t: "field", name: this.selfField() };
      case "oldSelf":
        return unrec("transition rules (oldSelf) are not supported");
      case "has":
      case "timestamp": {
        this.expectP("(");
        if (this.peek().k !== "id" || this.peek().v !== "self")
          unrec(`${t.v}() takes self.<field> only`);
        this.i++;
        const name = this.selfField();
        this.expectP(")");
        return { t: t.v === "has" ? "has" : "ts", name };
      }
      default:
        return unrec(
          this.isP("(")
            ? `function '${t.v}' is not supported`
            : `unsupported identifier '${t.v}'`,
        );
    }
  }

  /** `[has(self.a), has(self.b)].exists_one(x, x)`; the `[` is already consumed. */
  private existsOne(): CelAst {
    const items: CelAst[] = [];
    while (!this.isP("]")) {
      items.push(this.expr());
      if (!this.eatP(",")) break;
    }
    this.expectP("]");
    if (!this.eatP("."))
      return unrec("list literals are only supported in 'in' and exists_one");
    const m = this.ident();
    if (m !== "exists_one") return unrec(`list macro '${m}' is not supported`);
    this.expectP("(");
    const v1 = this.ident();
    this.expectP(",");
    const v2 = this.ident();
    this.expectP(")");
    if (v1 !== v2)
      return unrec("exists_one is only supported as exists_one(x, x)");
    const names: string[] = [];
    for (const it of items) {
      if (it.t !== "has")
        return unrec("exists_one is only supported over has() calls");
      names.push(it.name);
    }
    return { t: "one", names };
  }
}

/** Parse the supported CEL subset. Never throws; anything else is `{ ok: false, reason }`. */
export function parseCel(src: string): CelResult {
  try {
    return { ok: true, ast: new Parser(tokenize(src)).parse() };
  } catch (e) {
    if (e instanceof Unrecognised) return { ok: false, reason: e.message };
    return { ok: false, reason: "unrecognised CEL" };
  }
}

// ---------------------------------------------------------------------------------------------
// Pattern recogniser: AST -> one validonce rule shape
// ---------------------------------------------------------------------------------------------

type FieldsKind = "at_least_one_of" | "exactly_one_of" | "all_or_none";

type Shape =
  | { kind: "required_when"; field: string; when: Condition }
  | {
      kind: "compare";
      left: string;
      op: CompareOp;
      right: { field: string } | { value: string | number };
      type: CompareType;
    }
  | { kind: FieldsKind; fields: string[] };

interface Recognised {
  shape: Shape;
  row: RowId;
  uses: FieldUse[];
}

type Recognition = Recognised | { reason: string };

const OPS: Record<string, CompareOp> = {
  "==": "eq",
  "!=": "ne",
  "<": "lt",
  "<=": "le",
  ">": "gt",
  ">=": "ge",
};
const FLIP: Record<CompareOp, CompareOp> = {
  eq: "eq",
  ne: "ne",
  lt: "gt",
  le: "ge",
  gt: "lt",
  ge: "le",
};

function neg(c: Condition): Condition {
  if ("eq" in c) return { ne: c.eq };
  if ("ne" in c) return { eq: c.ne };
  if ("present" in c) return { absent: c.present };
  if ("absent" in c) return { present: c.absent };
  if ("all" in c) return { any: c.all.map(neg) };
  if ("any" in c) return { all: c.any.map(neg) };
  if ("not" in c) return c.not;
  return { not: c };
}

function flatten(ast: CelAst, t: "and" | "or"): CelAst[] {
  return ast.t === t ? [...flatten(ast.a, t), ...flatten(ast.b, t)] : [ast];
}

function scalar(l: Lit): Scalar {
  if (l.v === null) return unrec("comparison with null is not supported");
  return l.v;
}

function toCondition(ast: CelAst): Condition {
  switch (ast.t) {
    case "has":
      return { present: { field: ast.name } };
    case "not":
      return neg(toCondition(ast.a));
    case "and":
      return { all: flatten(ast, "and").map(toCondition) };
    case "or":
      return { any: flatten(ast, "or").map(toCondition) };
    case "in":
      if (ast.a.t !== "field")
        return unrec("'in' needs self.<field> on its left");
      return {
        in: { field: ast.a.name, values: ast.vals.map(scalar) },
      };
    case "cmp": {
      if (ast.op !== "==" && ast.op !== "!=")
        return unrec("ordering comparison inside a condition");
      const [f, l] =
        ast.a.t === "field" && ast.b.t === "lit"
          ? [ast.a, ast.b]
          : ast.b.t === "field" && ast.a.t === "lit"
            ? [ast.b, ast.a]
            : [undefined, undefined];
      if (!f || !l)
        return unrec(
          "condition comparison is not self.<field> against a literal",
        );
      const body = { field: f.name, value: scalar(l) };
      return ast.op === "==" ? { eq: body } : { ne: body };
    }
    default:
      return unrec("condition shape is not supported");
  }
}

function conditionUses(c: Condition, out: Array<[string, FieldUse["role"]]>) {
  if ("eq" in c) out.push([c.eq.field, "value"]);
  else if ("ne" in c) out.push([c.ne.field, "value"]);
  else if ("in" in c) out.push([c.in.field, "value"]);
  else if ("present" in c) out.push([c.present.field, "presence"]);
  else if ("absent" in c) out.push([c.absent.field, "presence"]);
  else if ("all" in c) for (const x of c.all) conditionUses(x, out);
  else if ("any" in c) for (const x of c.any) conditionUses(x, out);
  else conditionUses(c.not, out);
}

const distinct = (xs: string[]) => [...new Set(xs)];

function fieldsShape(kind: FieldsKind, names: string[]): Shape {
  const fields = distinct(names);
  if (fields.length < 2)
    return unrec(`${kind} needs two or more distinct fields`);
  return { kind, fields };
}

/** `has(a) == has(b) && has(b) == has(c)` -> one connected set of fields. */
function allOrNoneChain(ast: CelAst): string[] | undefined {
  const parts = flatten(ast, "and");
  const groups: Set<string>[] = [];
  for (const p of parts) {
    if (p.t !== "cmp" || p.op !== "==" || p.a.t !== "has" || p.b.t !== "has")
      return undefined;
    const hit = groups.filter(
      (g) =>
        g.has(p.a.t === "has" ? p.a.name : "") ||
        g.has(p.b.t === "has" ? p.b.name : ""),
    );
    const merged = new Set<string>([p.a.name, p.b.name]);
    for (const g of hit) {
      for (const n of g) merged.add(n);
      groups.splice(groups.indexOf(g), 1);
    }
    groups.push(merged);
  }
  const only = groups[0];
  if (groups.length !== 1 || !only) return undefined;
  const order = parts.flatMap((p) =>
    p.t === "cmp" && p.a.t === "has" && p.b.t === "has"
      ? [p.a.name, p.b.name]
      : [],
  );
  return distinct(order).filter((n) => only.has(n));
}

/** `(has(a) && has(b)) || (!has(a) && !has(b))` */
function allOrNoneOr(ast: CelAst): string[] | undefined {
  const terms = flatten(ast, "or");
  const [x, y] = terms;
  if (terms.length !== 2 || !x || !y) return undefined;
  const pos = (t: CelAst) =>
    flatten(t, "and").map((p) => (p.t === "has" ? p.name : undefined));
  const negs = (t: CelAst) =>
    flatten(t, "and").map((p) =>
      p.t === "not" && p.a.t === "has" ? p.a.name : undefined,
    );
  const all = (xs: (string | undefined)[]): string[] | undefined =>
    xs.every((n) => n !== undefined) ? (xs as string[]) : undefined;
  for (const [p, n] of [
    [x, y],
    [y, x],
  ] as const) {
    const a = all(pos(p));
    const b = all(negs(n));
    if (a && b && a.length === b.length && a.every((f) => b.includes(f)))
      return a;
  }
  return undefined;
}

function requiredWhen(field: string, when: Condition): Shape {
  return { kind: "required_when", field, when };
}

function recogniseCondition(ast: CelAst): Shape {
  if (ast.t === "one") return fieldsShape("exactly_one_of", ast.names);
  if (
    ast.t === "cmp" &&
    ast.op === "==" &&
    ast.a.t === "has" &&
    ast.b.t === "has"
  )
    return fieldsShape("all_or_none", [ast.a.name, ast.b.name]);
  if (ast.t === "and") {
    const chain = allOrNoneChain(ast);
    if (chain) return fieldsShape("all_or_none", chain);
    return unrec(
      "a conjunction of several rules is not a single validonce rule",
    );
  }
  if (ast.t === "or") {
    const aon = allOrNoneOr(ast);
    if (aon) return fieldsShape("all_or_none", aon);
    const terms = flatten(ast, "or");
    const has = terms.filter((t) => t.t === "has");
    if (has.length === terms.length)
      return fieldsShape(
        "at_least_one_of",
        has.map((h) => (h.t === "has" ? h.name : "")),
      );
    if (has.length === 1 && has[0]?.t === "has") {
      const parts = terms
        .filter((t) => t.t !== "has")
        .map((t) => neg(toCondition(t)));
      const when =
        parts.length === 1 ? (parts[0] as Condition) : { all: parts };
      return requiredWhen(has[0].name, when);
    }
    return unrec(
      "disjunction does not match 'condition implies has(self.field)'",
    );
  }
  if (ast.t === "cond") {
    const [a, b] = [ast.a, ast.b];
    const isTrue = (x: CelAst) => x.t === "lit" && x.v === true;
    if (a.t === "has" && isTrue(b))
      return requiredWhen(a.name, toCondition(ast.c));
    if (isTrue(a) && b.t === "has")
      return requiredWhen(b.name, neg(toCondition(ast.c)));
    return unrec("conditional does not match 'cond ? has(self.field) : true'");
  }
  return unrec("expression shape is not in the translation table");
}

function operand(
  ast: CelAst,
): { field: string; ts: boolean } | { lit: Lit } | undefined {
  if (ast.t === "field") return { field: ast.name, ts: false };
  if (ast.t === "ts") return { field: ast.name, ts: true };
  if (ast.t === "lit") return { lit: ast };
  return undefined;
}

function fieldCompareType(f: FieldInfo, viaTimestamp: boolean): CompareType {
  if (!f.known) return unrec(`field '${f.name}' is not declared in the schema`);
  if (viaTimestamp) {
    if (
      f.type !== "string" ||
      (f.format !== undefined && f.format !== "date-time")
    )
      return unrec(
        `timestamp() on '${f.name}' which is not a date-time string`,
      );
    return "datetime";
  }
  if (f.type === "integer" || f.type === "number") return "number";
  // CEL compares date-time strings as plain strings, not instants, so only timestamp() means datetime.
  if (f.type === "string") return f.format === "date" ? "date" : "string";
  return unrec(
    `field '${f.name}' (type ${f.type ?? "unknown"}) is not comparable`,
  );
}

function recogniseCompare(
  ast: CelAst,
  info: (n: string) => FieldInfo,
): Shape & { kind: "compare" } {
  if (ast.t !== "cmp") return unrec("not a comparison");
  const a = operand(ast.a);
  const b = operand(ast.b);
  if (!a || !b)
    return unrec(
      "comparison operands must be self.<field>, timestamp(self.<field>) or a literal",
    );
  let op = OPS[ast.op] as CompareOp;
  if ("lit" in a && "lit" in b) return unrec("comparison of two literals");
  if ("lit" in a && "field" in b) {
    return buildCompare(b, a.lit, FLIP[op], info);
  }
  if ("field" in a && "lit" in b) return buildCompare(a, b.lit, op, info);
  if ("field" in a && "field" in b) {
    if (a.ts !== b.ts) return unrec("timestamp() on only one side");
    const ta = fieldCompareType(info(a.field), a.ts);
    const tb = fieldCompareType(info(b.field), b.ts);
    if (ta !== tb) return unrec(`comparison of ${ta} with ${tb}`);
    op = OPS[ast.op] as CompareOp;
    return {
      kind: "compare",
      left: a.field,
      op,
      right: { field: b.field },
      type: ta,
    };
  }
  return unrec("comparison shape is not supported");
}

function buildCompare(
  f: { field: string; ts: boolean },
  lit: Lit,
  op: CompareOp,
  info: (n: string) => FieldInfo,
): Shape & { kind: "compare" } {
  if (f.ts) return unrec("timestamp() against a literal is not supported");
  const type = fieldCompareType(info(f.field), false);
  const v = lit.v;
  if (v === null) return unrec("comparison with null is not supported");
  const ok =
    type === "number"
      ? typeof v === "number"
      : typeof v === "string" &&
        (type !== "date" || /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (!ok || v === null || typeof v === "boolean")
    return unrec(`literal does not match the ${type} field '${f.field}'`);
  return { kind: "compare", left: f.field, op, right: { value: v }, type };
}

function usesOf(shape: Shape, info: (n: string) => FieldInfo): FieldUse[] {
  const raw: Array<[string, FieldUse["role"]]> = [];
  if (shape.kind === "required_when") {
    raw.push([shape.field, "presence"]);
    conditionUses(shape.when, raw);
  } else if (shape.kind === "compare") {
    raw.push([shape.left, "value"]);
    if ("field" in shape.right) raw.push([shape.right.field, "value"]);
  } else for (const f of shape.fields) raw.push([f, "presence"]);
  return raw.map(([n, role]) => ({ field: info(n), role }));
}

/** `(has(a) ? 1 : 0) + (has(b) ? 1 : 0) + … == 1` (either side), nothing else. */
function sumExactlyOne(ast: CelAst & { t: "cmp" }): Shape {
  const [sum, other] = ast.a.t === "sum" ? [ast.a, ast.b] : [ast.b, ast.a];
  if (sum.t !== "sum") return unrec("arithmetic operator '+' is not supported");
  const names: string[] = [];
  for (const t of sum.terms) {
    const one = (x: CelAst, v: number) =>
      x.t === "lit" && x.v === v && x.num === "int";
    if (t.t !== "cond" || t.c.t !== "has" || !one(t.a, 1) || !one(t.b, 0))
      return unrec("arithmetic operator '+' is not supported");
    names.push(t.c.name);
  }
  if (
    ast.op !== "==" ||
    !(other.t === "lit" && other.v === 1 && other.num === "int")
  )
    return unrec("a sum of has() ternaries is only supported as '== 1'");
  return fieldsShape("exactly_one_of", names);
}

function recognise(ast: CelAst, info: (n: string) => FieldInfo): Recognition {
  try {
    const shape: Shape =
      ast.t === "cmp" && (ast.a.t === "sum" || ast.b.t === "sum")
        ? sumExactlyOne(ast)
        : ast.t === "cmp" && !(ast.a.t === "has" && ast.b.t === "has")
          ? recogniseCompare(ast, info)
          : recogniseCondition(ast);
    const row: RowId =
      shape.kind === "compare"
        ? (`compare.${shape.type}` as RowId)
        : shape.kind;
    return { shape, row, uses: usesOf(shape, info) };
  } catch (e) {
    if (e instanceof Unrecognised) return { reason: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Schema walking
// ---------------------------------------------------------------------------------------------

export interface TranslateContext {
  /** Names the schema in rule ids (`k8s.<schemaName>.<kind>.<n>`) and message keys. */
  schemaName: string;
  /** Test-only: overrides entries of TRANSLATIONS. */
  translations?: Partial<Record<RowId, Level>>;
  /** Overrides entries of GUARDS. */
  guards?: Partial<Record<RowId, Guard>>;
}

export interface KubernetesRuleReport {
  /** The schema (OpenAPI component name, or the CRD kind). */
  schema: string;
  /** JSON pointer of the node holding the rule, relative to the schema (usable with `rulesAt`). */
  schemaPath: string;
  /** Index in that node's `x-kubernetes-validations`. */
  index: number;
  cel: string;
  outcome: "translated" | "server_only";
  reason: string;
  /** The emitted rule's id, when a rule was emitted. */
  ruleId?: string;
  notes?: string[];
}

export interface TranslationResult {
  schema: unknown;
  catalog: Catalog;
  report: KubernetesRuleReport[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const GENERIC_KEY = "k8s.rule_failed";
const esc = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");

function fieldInfoOf(node: Obj, name: string): FieldInfo {
  const props = isObj(node.properties) ? node.properties : {};
  const prop = Object.hasOwn(props, name) ? props[name] : undefined;
  const required = Array.isArray(node.required) && node.required.includes(name);
  if (!isObj(prop)) return { name, known: false, nullable: false, required };
  const types = Array.isArray(prop.type) ? prop.type : [prop.type];
  const type = types.find((t) => typeof t === "string" && t !== "null");
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  return {
    name,
    known: true,
    type: typeof type === "string" ? type : undefined,
    format: typeof prop.format === "string" ? prop.format : undefined,
    nullable: prop.nullable === true || types.includes("null"),
    required,
    minLength: num(prop.minLength),
    minItems: num(prop.minItems),
  };
}

function pathOf(fieldPath: unknown): { path?: string; note?: string } {
  if (typeof fieldPath !== "string") return {};
  const m = /^\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(fieldPath);
  if (m) return { path: m[1] };
  return {
    note: `fieldPath "${fieldPath}" is not a single field; the rule keeps its default path`,
  };
}

interface State {
  ctx: TranslateContext;
  catalog: Catalog;
  report: KubernetesRuleReport[];
  counter: number;
}

function emitRule(
  st: State,
  entry: Obj,
  cel: string,
  rec: Recognition,
  pathOverride: string | undefined,
  n: number,
): { rule?: Rule; outcome: "translated" | "server_only"; reason: string } {
  const { schemaName } = st.ctx;
  let serverOnly = false;
  let reason = "translated";

  // Unrecognised CEL has no rule shape. It is reported only, never written to x-validonce.
  if ("reason" in rec) return { outcome: "server_only", reason: rec.reason };
  const shape = rec.shape;
  {
    const level = st.ctx.translations?.[rec.row] ?? TRANSLATIONS[rec.row];
    const guard = st.ctx.guards?.[rec.row] ?? GUARDS[rec.row];
    if (level === "drop") {
      serverOnly = true;
      reason = `row '${rec.row}' is not allowlisted (drop)`;
    } else if (level === "guarded" && !guard(rec.uses)) {
      serverOnly = true;
      reason = `row '${rec.row}' guard rejected the field schemas`;
    }
  }

  const id = `k8s.${schemaName}.${shape.kind}.${n}`;
  let message: RuleMessage;
  const useGeneric =
    typeof entry.messageExpression === "string" ||
    typeof entry.message !== "string" ||
    entry.message === "";
  if (useGeneric) {
    message = { key: GENERIC_KEY, params: { cel } };
    st.catalog[GENERIC_KEY] = "failed rule: {cel}";
  } else {
    const key = `k8s.${schemaName}.${n}`;
    st.catalog[key] = entry.message as string;
    message = serverOnly ? { key, params: { cel } } : { key };
  }

  const base = { id, ...(pathOverride ? { path: pathOverride } : {}), message };
  const so = serverOnly ? { server_only: true as const } : {};
  let rule: Rule;
  if (shape.kind === "required_when")
    rule = {
      ...base,
      kind: "required_when",
      field: shape.field,
      when: shape.when,
      ...so,
    };
  else if (shape.kind === "compare")
    rule = {
      ...base,
      kind: "compare",
      left: { field: shape.left },
      op: shape.op,
      right: shape.right,
      type: shape.type,
      ...so,
    };
  else rule = { ...base, kind: shape.kind, fields: shape.fields, ...so };
  return {
    rule,
    outcome: serverOnly ? "server_only" : "translated",
    reason,
  };
}

function processNode(st: State, node: Obj, pointer: string): void {
  const validations = node["x-kubernetes-validations"];
  if (Array.isArray(validations)) {
    const rules: Rule[] = [];
    const objectLike = node.type === "object" || isObj(node.properties);
    validations.forEach((entry: unknown, index: number) => {
      const n = st.counter++;
      const e = isObj(entry) ? entry : {};
      const cel = typeof e.rule === "string" ? e.rule : "";
      const report: KubernetesRuleReport = {
        schema: st.ctx.schemaName,
        schemaPath: pointer,
        index,
        cel,
        outcome: "server_only",
        reason: "",
      };
      st.report.push(report);
      if (cel === "") {
        report.reason = "the validation has no rule string";
        return;
      }
      if (!objectLike) {
        report.reason =
          "the node is not an object, so rules over self.<field> do not apply";
        return;
      }
      const parsed = parseCel(cel);
      const rec: Recognition = parsed.ok
        ? recognise(parsed.ast, (name) => fieldInfoOf(node, name))
        : { reason: parsed.reason };
      const { path, note } = pathOf(e.fieldPath);
      const out = emitRule(st, e, cel, rec, path, n);
      report.outcome = out.outcome;
      report.reason = out.reason;
      if (note) report.notes = [note];
      if (out.rule) {
        report.ruleId = out.rule.id;
        rules.push(out.rule);
      }
    });
    if (rules.length > 0) {
      const existing = node["x-validonce"];
      const prior =
        isObj(existing) && Array.isArray(existing.rules) ? existing.rules : [];
      node["x-validonce"] = { version: 1, rules: [...prior, ...rules] };
    }
  }
  if (isObj(node.properties))
    for (const [k, v] of Object.entries(node.properties))
      if (isObj(v)) processNode(st, v, `${pointer}/properties/${esc(k)}`);
  if (isObj(node.items)) processNode(st, node.items, `${pointer}/items`);
  if (isObj(node.additionalProperties))
    processNode(
      st,
      node.additionalProperties,
      `${pointer}/additionalProperties`,
    );
}

/**
 * Translate one schema tree. Returns a copy of `schema` with `x-validonce` next to every
 * `x-kubernetes-validations` (the originals stay), the message `catalog`, and a per-rule `report`.
 */
export function translateKubernetesSchema(
  schema: unknown,
  ctx: TranslateContext,
): TranslationResult {
  const copy = structuredClone(schema);
  const st: State = { ctx, catalog: {}, report: [], counter: 0 };
  if (isObj(copy)) processNode(st, copy, "");
  return { schema: copy, catalog: st.catalog, report: st.report };
}

/** Translate every schema of `components.schemas` (a Kubernetes `/openapi/v3/apis/<g>/<v>` document). */
export function translateKubernetesOpenApi(doc: unknown): {
  doc: unknown;
  catalog: Catalog;
  report: KubernetesRuleReport[];
} {
  const out = structuredClone(doc);
  const catalog: Catalog = {};
  const report: KubernetesRuleReport[] = [];
  const components = isObj(out) ? out.components : undefined;
  const schemas = isObj(components) ? components.schemas : undefined;
  if (isObj(schemas)) {
    for (const [name, schema] of Object.entries(schemas)) {
      const r = translateKubernetesSchema(schema, { schemaName: name });
      schemas[name] = r.schema;
      Object.assign(catalog, r.catalog);
      report.push(...r.report);
    }
  }
  return { doc: out, catalog, report };
}

/** Translate a parsed CRD manifest: `spec.versions[].schema.openAPIV3Schema`, keyed by version name. */
export function translateCrd(crd: unknown): {
  versions: Record<string, TranslationResult>;
} {
  const spec = isObj(crd) && isObj(crd.spec) ? crd.spec : {};
  const names = isObj(spec.names) ? spec.names : {};
  const meta = isObj(crd) && isObj(crd.metadata) ? crd.metadata : {};
  const schemaName =
    typeof names.kind === "string"
      ? names.kind
      : typeof meta.name === "string"
        ? meta.name
        : "crd";
  const versions: Record<string, TranslationResult> = {};
  for (const v of Array.isArray(spec.versions) ? spec.versions : []) {
    if (!isObj(v) || typeof v.name !== "string") continue;
    const root = isObj(v.schema) ? v.schema.openAPIV3Schema : undefined;
    if (root === undefined) continue;
    versions[v.name] = translateKubernetesSchema(root, { schemaName });
  }
  return { versions };
}

/**
 * The RuleSet at a nested node of `components.schemas[schemaName]`, addressed by a JSON pointer such
 * as `/properties/spec` (`""` is the schema itself). Undefined when the node or its rules are absent.
 */
export function rulesAt(
  doc: unknown,
  schemaName: string,
  pointer: string,
): RuleSet | undefined {
  if (pointer !== "" && !pointer.startsWith("/"))
    throw new ValidonceFormatError(
      `${pointer}: a JSON pointer starts with "/"`,
    );
  const components = isObj(doc) ? doc.components : undefined;
  const schemas = isObj(components) ? components.schemas : undefined;
  if (!isObj(schemas) || !Object.hasOwn(schemas, schemaName)) return undefined;
  let node: unknown = schemas[schemaName];
  for (const raw of pointer === "" ? [] : pointer.slice(1).split("/")) {
    const seg = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(node)) node = node[Number(seg)];
    else if (isObj(node) && Object.hasOwn(node, seg)) node = node[seg];
    else return undefined;
  }
  if (!isObj(node) || node["x-validonce"] === undefined) return undefined;
  try {
    return parseRuleSet(node["x-validonce"]);
  } catch (e) {
    if (e instanceof ValidonceFormatError)
      throw new ValidonceFormatError(`${schemaName}${pointer}: ${e.message}`);
    throw e;
  }
}
