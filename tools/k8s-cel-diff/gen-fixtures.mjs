// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// Generates ../../conformance/kubernetes/*.json (Part 0 semantics spike fixtures).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "../../conformance/kubernetes");
mkdirSync(out, { recursive: true });
const M = Symbol("missing");
const mk = (o) => {
  const r = {};
  for (const [k, v] of Object.entries(o)) if (v !== M) r[k] = v;
  return r;
};
const label = (v) => (v === M ? "MISSING" : JSON.stringify(v).replace(/^"RAW:(.*)"$/, "$1"));
const schema = (props, rules, extra = {}) => ({
  type: "object",
  properties: props,
  "x-kubernetes-validations": rules.map((r) => (typeof r === "string" ? { rule: r } : r)),
  ...extra,
});
const S = { type: "string" };
const SN = { type: "string", nullable: true };
const product = (names, vals) => names.reduce((acc, n) => acc.flatMap((o) => vals.map((v) => ({ ...o, [n]: v }))), [{}]);
const note = (o, names) => names.map((n) => `${n}=${label(o[n])}`).join(" ");
const inputs = (base, names, vals) => product(names, vals).map((o) => ({ data: mk({ ...base, ...o }), note: note(o, names) }));
const withF = (name, vals) => vals.flatMap((v) => [M, "x"].map((f) => ({ data: mk({ [name]: v, f }), note: `${name}=${label(v)} f=${label(f)}` })));
const one = (id, description, sch, rules, vo, ins) => ({
  id,
  description,
  schema: schema(sch.props, rules, sch.extra),
  rule: 0,
  validonce: vo,
  inputs: ins,
});
const files = {};
const put = (f, c) => (files[f] ??= []).push(c);
const single = (name, vals, extra = {}) => vals.map((v) => ({ data: mk({ ...extra, [name]: v }), note: `${name}=${label(v)}` }));

// ---------- 1. has() versus blank ----------
const H = "10-has-vs-blank.json";
const T = {
  string: { type: "string" },
  array: { type: "array", items: { type: "string" } },
  object: { type: "object", properties: { k: { type: "string" } } },
  integer: { type: "integer" },
  boolean: { type: "boolean" },
};
const V = {
  string: [M, null, "", " ", "x"],
  array: [M, null, [], ["a"]],
  object: [M, null, {}, { k: "v" }],
  integer: [M, null, 0, 1],
  boolean: [M, null, false, true],
};
const rwf = { kind: "required_when", field: "f" };
const eqPro = { eq: { field: "plan", value: "pro" } };
const rwPro = [{ ...rwf, when: eqPro }];
const RULE_PRO = "!(self.plan == 'pro') || has(self.f)";
for (const [t, sc] of Object.entries(T))
  for (const nullable of [false, true]) {
    const f = nullable ? { ...sc, nullable: true } : sc;
    put(
      H,
      one(`has.rw.${t}.${nullable ? "nullable" : "nonnull"}`, `required_when f when plan=='pro'; f is ${nullable ? "" : "non-"}nullable ${t}`, { props: { plan: S, f } }, [RULE_PRO], rwPro, [
        ...single("f", V[t], { plan: "pro" }),
        { data: { plan: "free" }, note: "plan=free f=MISSING (condition false)" },
      ]),
    );
  }
const fProps = (f) => ({ props: { plan: S, f } });
put(H, one("has.rw.string.minLength1", "f has minLength 1 (guard for empty string)", fProps({ type: "string", minLength: 1 }), [RULE_PRO], rwPro, single("f", [M, null, "", "x"], { plan: "pro" })));
put(H, one("has.rw.array.minItems1", "f array with minItems 1 (guard for empty list)", fProps({ type: "array", minItems: 1, items: S }), [RULE_PRO], rwPro, single("f", [M, null, [], ["a"]], { plan: "pro" })));
put(H, one("has.rw.string.default", "f has a default: missing becomes the default before CEL runs", fProps({ type: "string", default: "d" }), [RULE_PRO], rwPro, single("f", [M, null, "", "x"], { plan: "pro" })));
put(H, { ...one("has.rw.string.required", "f listed in required: missing is rejected before CEL", { props: { plan: S, f: S }, extra: { required: ["f"] } }, [RULE_PRO], rwPro, single("f", [M, null, "", "x"], { plan: "pro" })) });
put(H, one("has.ternary", "cond ? has(self.f) : true", fProps(S), ["self.plan == 'pro' ? has(self.f) : true"], rwPro, [M, "", "x"].flatMap((v) => ["pro", "free"].map((p) => ({ data: mk({ plan: p, f: v }), note: `plan=${p} f=${label(v)}` })))));
for (const [nm, g] of [["nonnull", S], ["nullable", SN], ["minLength1", { type: "string", minLength: 1 }]]) {
  put(H, one(`has.cond.present.${nm}`, `required_when f when present g; g is ${nm}`, { props: { g, f: S } }, ["!has(self.g) || has(self.f)"], [{ ...rwf, when: { present: { field: "g" } } }], inputs({}, ["g", "f"], [M, null, "", "x"])));
  put(H, one(`has.cond.absent.${nm}`, `required_when f when absent g; g is ${nm}`, { props: { g, f: S } }, ["has(self.g) || has(self.f)"], [{ ...rwf, when: { absent: { field: "g" } } }], inputs({}, ["g", "f"], [M, null, "", "x"])));
}
put(H, one("has.cond.all", "plan=='pro' && has(g) => f", { props: { plan: S, g: S, f: S } }, ["!(self.plan == 'pro' && has(self.g)) || has(self.f)"], [{ ...rwf, when: { all: [eqPro, { present: { field: "g" } }] } }], inputs({ plan: "pro" }, ["g", "f"], [M, "", "x"])));
put(H, one("has.cond.any", "plan in pro|team via ||", fProps(S), ["!(self.plan == 'pro' || self.plan == 'team') || has(self.f)"], [{ ...rwf, when: { any: [eqPro, { eq: { field: "plan", value: "team" } }] } }], ["pro", "team", "free"].flatMap((p) => [M, "x"].map((v) => ({ data: mk({ plan: p, f: v }), note: `plan=${p} f=${label(v)}` })))));
put(H, one("has.cond.not", "`has(g) || has(f)` read as required_when f when not present g", { props: { g: S, f: S } }, ["has(self.g) || has(self.f)"], [{ ...rwf, when: { not: { present: { field: "g" } } } }], inputs({}, ["g", "f"], [M, "", "x"])));

// ---------- 2. eq / ne / in, type mismatches, unset operands ----------
const E = "20-eq-ne-in.json";
const rw = (when) => [{ ...rwf, when }];
put(E, one("eq.optional.eq", "plan optional; `self.plan == 'pro'` on a missing plan", fProps(S), [RULE_PRO], rw(eqPro), inputs({}, ["plan", "f"], [M, "pro", "free"])));
put(E, one("eq.optional.ne", "plan optional; `self.plan != 'pro'` as condition", fProps(S), ["!(self.plan != 'pro') || has(self.f)"], rw({ ne: { field: "plan", value: "pro" } }), inputs({}, ["plan", "f"], [M, "pro", "free"])));
put(E, one("eq.optional.in", "plan optional; `self.plan in [...]`", fProps(S), ["!(self.plan in ['pro','team']) || has(self.f)"], rw({ in: { field: "plan", values: ["pro", "team"] } }), inputs({}, ["plan", "f"], [M, "pro", "team", "free"])));
put(E, one("eq.guarded.eq", "has() guard makes eq exact", fProps(S), ["!(has(self.plan) && self.plan == 'pro') || has(self.f)"], rw(eqPro), inputs({}, ["plan", "f"], [M, null, "pro", "free"])));
put(E, one("eq.guarded.ne", "ne is true for a blank field in validonce, so the CEL guard is `!has || !=`", fProps(S), ["!(!has(self.plan) || self.plan != 'pro') || has(self.f)"], rw({ ne: { field: "plan", value: "pro" } }), inputs({}, ["plan", "f"], [M, "pro", "free"])));
put(E, one("eq.guarded.in", "in with has() guard", fProps(S), ["!(has(self.plan) && self.plan in ['pro','team']) || has(self.f)"], rw({ in: { field: "plan", values: ["pro", "team"] } }), inputs({}, ["plan", "f"], [M, "pro", "team", "free"])));
put(E, one("eq.required.eq", "plan listed in required: eq is exact", { props: { plan: S, f: S }, extra: { required: ["plan"] } }, [RULE_PRO], rw(eqPro), inputs({}, ["plan", "f"], [M, "pro", "free", ""])));
put(E, one("eq.default.eq", "plan has a default", { props: { plan: { type: "string", default: "free" }, f: S } }, [RULE_PRO], rw(eqPro), inputs({}, ["plan", "f"], [M, null, "pro", "free"])));
put(E, one("eq.int.eqlit", "integer field == int literal", { props: { n: { type: "integer" }, f: S }, extra: { required: ["n"] } }, ["!(self.n == 1) || has(self.f)"], rw({ eq: { field: "n", value: 1 } }), [...[1, 2, "RAW:1.0", 0].flatMap((n) => [M, "x"].map((f) => ({ data: mk({ n, f }), note: `n=${label(n)} f=${label(f)}` }))), { data: { n: 1.5, f: "x" }, note: "n=1.5 (not an integer)" }]));
put(E, one("eq.double.eqint", "number field == int literal", { props: { d: { type: "number" }, f: S }, extra: { required: ["d"] } }, ["!(self.d == 1) || has(self.f)"], rw({ eq: { field: "d", value: 1 } }), withF("d", [1, 1.5, 2])));
put(E, one("eq.double.eqdbl", "number field == double literal", { props: { d: { type: "number" }, f: S }, extra: { required: ["d"] } }, ["!(self.d == 1.5) || has(self.f)"], rw({ eq: { field: "d", value: 1.5 } }), withF("d", [1, 1.5, 2])));
put(E, one("eq.bool", "boolean == true", { props: { flag: { type: "boolean" }, f: S }, extra: { required: ["flag"] } }, ["!(self.flag == true) || has(self.f)"], rw({ eq: { field: "flag", value: true } }), withF("flag", [true, false])));
put(E, one("eq.bool.bare", "bare boolean `!self.flag || has(f)`", { props: { flag: { type: "boolean" }, f: S }, extra: { required: ["flag"] } }, ["!self.flag || has(self.f)"], rw({ eq: { field: "flag", value: true } }), withF("flag", [true, false])));
put(E, one("eq.mismatch.int-vs-string", "int field == string literal", { props: { n: { type: "integer" }, f: S } }, ["!(self.n == 'a') || has(self.f)"], rw({ eq: { field: "n", value: "a" } }), withF("n", [1, M])));
put(E, one("eq.mismatch.in-int-vs-string", "int field in string list", { props: { n: { type: "integer" }, f: S } }, ["!(self.n in ['a','b']) || has(self.f)"], rw({ in: { field: "n", values: ["a", "b"] } }), withF("n", [1, M])));
put(E, one("eq.mismatch.string-vs-int", "string field == int literal", { props: { s: S, f: S } }, ["!(self.s == 1) || has(self.f)"], rw({ eq: { field: "s", value: 1 } }), inputs({}, ["s", "f"], ["1", M])));
put(E, one("eq.intorstring.string", "x-kubernetes-int-or-string == 'pro'", { props: { v: { "x-kubernetes-int-or-string": true }, f: S }, extra: { required: ["v"] } }, ["!(self.v == 'pro') || has(self.f)"], rw({ eq: { field: "v", value: "pro" } }), withF("v", ["pro", "x", 1, 2])));
put(E, one("eq.intorstring.int", "x-kubernetes-int-or-string == 1", { props: { v: { "x-kubernetes-int-or-string": true }, f: S }, extra: { required: ["v"] } }, ["!(self.v == 1) || has(self.f)"], rw({ eq: { field: "v", value: 1 } }), withF("v", ["1", 1, 2])));
put(E, one("eq.nullable.string", "nullable plan, explicit null, no guard", { props: { plan: SN, f: S } }, [RULE_PRO], rw(eqPro), inputs({}, ["plan", "f"], [null, "pro"])));
put(E, one("eq.nullable.string.guarded", "nullable plan, has() guard", { props: { plan: SN, f: S } }, ["!(has(self.plan) && self.plan == 'pro') || has(self.f)"], rw(eqPro), inputs({}, ["plan", "f"], [null, "pro"])));
put(E, one("eq.string.case", "string eq is exact: case, trailing space, accents", { props: { plan: S, f: S }, extra: { required: ["plan"] } }, [RULE_PRO], rw(eqPro), inputs({}, ["plan", "f"], ["pro", "Pro", "pro ", "pró"])));

// ---------- 3. number compare ----------
const mix2 = ([x, y], xs, ys) => xs.flatMap((p) => ys.map((q) => ({ data: { [x]: p, [y]: q }, note: `${x}=${p} ${y}=${q}` })));
const OPS = { "<": "lt", "<=": "le", ">": "gt", ">=": "ge", "==": "eq", "!=": "ne" };
const cmp = (type, op, l, r) => [{ kind: "compare", left: { field: l }, op, right: r.startsWith("#") ? { value: JSON.parse(r.slice(1)) } : { field: r }, type }];
const N = "30-compare-number.json";
const IN2 = { props: { a: { type: "integer" }, b: { type: "integer" } } };
const REQ = { required: ["a", "b"] };
const nv = [M, null, 0, 1, 2, -1];
for (const op of Object.keys(OPS)) put(N, one(`num.int-int.${OPS[op]}`, `int a ${op} int b, no guard`, IN2, [`self.a ${op} self.b`], cmp("number", OPS[op], "a", "b"), inputs({}, ["a", "b"], nv)));
put(N, one("num.int-int.guarded", "int a <= int b with has() guards", IN2, ["!has(self.a) || !has(self.b) || self.a <= self.b"], cmp("number", "le", "a", "b"), inputs({}, ["a", "b"], nv)));
put(N, one("num.int-int.required", "int a <= int b, both required", { ...IN2, extra: REQ }, ["self.a <= self.b"], cmp("number", "le", "a", "b"), inputs({}, ["a", "b"], [M, 0, 1, 2])));
put(N, one("num.dbl-dbl.le", "number a <= number b", { props: { a: { type: "number" }, b: { type: "number" } }, extra: REQ }, ["self.a <= self.b"], cmp("number", "le", "a", "b"), inputs({}, ["a", "b"], [0.1, 0.2, 0.30000000000000004, 0.3, 1, 1.5])));
for (const op of ["<=", "=="]) {
  put(N, one(`num.int-dbl.${OPS[op]}`, `int a ${op} number b (mixed)`, { props: { a: { type: "integer" }, b: { type: "number" } }, extra: REQ }, [`self.a ${op} self.b`], cmp("number", OPS[op], "a", "b"), mix2(["a", "b"], [1, 2], [1, 1.5, 2])));
  put(N, one(`num.dbl-int.${OPS[op]}`, `number a ${op} int b (mixed)`, { props: { a: { type: "number" }, b: { type: "integer" } }, extra: REQ }, [`self.a ${op} self.b`], cmp("number", OPS[op], "a", "b"), mix2(["a", "b"], [1, 1.5, 2], [1, 2])));
}
const A1 = { props: { a: { type: "integer" } } };
put(N, one("num.lit.int-ge0", "integer a >= 0, has() guard", A1, ["!has(self.a) || self.a >= 0"], cmp("number", "ge", "a", "#0"), single("a", [M, null, -1, 0, 1])));
put(N, one("num.lit.int-ge0.noguard", "integer a >= 0, no guard", A1, ["self.a >= 0"], cmp("number", "ge", "a", "#0"), single("a", [M, -1, 0])));
put(N, one("num.lit.dbl-ge-int", "number a >= int literal 1", { props: { a: { type: "number" } }, extra: { required: ["a"] } }, ["self.a >= 1"], cmp("number", "ge", "a", "#1"), single("a", [0.5, 1, 1.5])));
put(N, one("num.lit.dbl-ge-dbl", "number a >= double literal 0.5", { props: { a: { type: "number" } }, extra: { required: ["a"] } }, ["self.a >= 0.5"], cmp("number", "ge", "a", "#0.5"), single("a", [0, 0.5, 1])));
put(N, one("num.lit.int-ge-dbl", "integer a >= double literal 1.5", { ...A1, extra: { required: ["a"] } }, ["self.a >= 1.5"], cmp("number", "ge", "a", "#1.5"), single("a", [1, 2])));
put(N, one("num.int.big", "int64 beyond 2^53: CEL ints are exact, validonce numbers are IEEE doubles", { ...IN2, extra: REQ }, ["self.a <= self.b"], cmp("number", "le", "a", "b"), [
  { data: { a: "RAW:9007199254740993", b: "RAW:9007199254740992" }, note: "a=2^53+1 b=2^53 (JS parses a to 2^53)" },
]));

// ---------- 4. string compare ----------
const Sx = "40-compare-string.json";
const AB = { props: { a: S, b: S } };
const sv = [M, null, "", "a", "B", "b", "é", "f", "é", "￿", "\u{10000}", "\u{1F600}"];
const pairs = (vals) => product(["a", "b"], vals).map((o) => ({ data: mk(o), note: note(o, ["a", "b"]) }));
for (const op of ["<", "<=", "==", "!="]) put(Sx, one(`str.${OPS[op]}`, `string a ${op} string b, no guard`, AB, [`self.a ${op} self.b`], cmp("string", OPS[op], "a", "b"), pairs(sv)));
put(Sx, one("str.le.guarded", "a <= b with has() guards (blank \"\" is present)", AB, ["!has(self.a) || !has(self.b) || self.a <= self.b"], cmp("string", "le", "a", "b"), pairs([M, null, "", "x", "y"])));
const MIN = { type: "string", minLength: 1 };
put(Sx, one("str.le.minLength1", "a, b strings with minLength 1, has() guards", { props: { a: MIN, b: MIN } }, ["!has(self.a) || !has(self.b) || self.a <= self.b"], cmp("string", "le", "a", "b"), pairs([M, "", "x", "y"])));
put(Sx, one("str.lit.lt", "string a < literal 'm'", { props: { a: S } }, ["!has(self.a) || self.a < 'm'"], cmp("string", "lt", "a", '#"m"'), single("a", [M, "", "a", "m", "z", "M"])));
put(Sx, one("str.date-lexical", "format: date strings compared as strings", { props: { a: { type: "string", format: "date" }, b: { type: "string", format: "date" } } }, ["!has(self.a) || !has(self.b) || self.a <= self.b"], cmp("date", "le", "a", "b"), pairs([M, "2026-01-02", "2026-01-10", "2026-1-2", "0000-01-01", "2026-02-30"])));

// ---------- 5. dates and timestamps ----------
const D = "50-datetime.json";
const tsv = ["2026-01-02T10:00:00Z", "2026-01-02T15:30:00+05:30", "2026-01-02T10:00:00.0004Z", "2026-01-02T10:00:00.0001Z", "2026-01-02T10:00:00.123456789Z", "2026-01-02", "2026-01-02T10:00:00", "2026-01-02t10:00:00z", "2026-01-02 10:00:00Z", "2026-01-02T24:00:00Z", "2026-01-02T23:59:60Z", "2026-02-30T10:00:00Z", "0000-01-01T00:00:00Z", "2026-01-02T10:00:00+24:00", "", "x"];
const B = "2026-01-02T10:00:00Z";
const ts2 = (list) => list.map(([a, b]) => ({ data: { a, b }, note: `a=${a} b=${b}` }));
for (const fmt of [null, "date-time"]) {
  const sch = fmt ? { type: "string", format: fmt } : S;
  put(D, one(`ts.le.${fmt ?? "noformat"}`, `timestamp(a) <= timestamp(b), format ${fmt ?? "none"}; b fixed to ${B}`, { props: { a: sch, b: sch }, extra: REQ }, ["timestamp(self.a) <= timestamp(self.b)"], cmp("datetime", "le", "a", "b"), ts2(tsv.map((a) => [a, B]))));
}
put(D, one("ts.gt.subms", "timestamp(a) > timestamp(b): sub-millisecond difference", { ...AB, extra: REQ }, ["timestamp(self.a) > timestamp(self.b)"], cmp("datetime", "gt", "a", "b"), ts2([["2026-01-02T10:00:00.0009Z", "2026-01-02T10:00:00.0001Z"], ["2026-01-02T10:00:00.0019Z", "2026-01-02T10:00:00.0011Z"], ["2026-01-02T10:00:00.0020Z", "2026-01-02T10:00:00.0019Z"]])));
put(D, one("ts.eq.offset", "timestamp(a) == timestamp(b) across offsets", { ...AB, extra: REQ }, ["timestamp(self.a) == timestamp(self.b)"], cmp("datetime", "eq", "a", "b"), ts2([[B, "2026-01-02T15:30:00+05:30"], [B, "2026-01-02T10:00:00-00:00"], [B, "2026-01-02T05:00:00-05:00"]])));
put(D, one("ts.le.optional", "timestamp(a) <= timestamp(b), missing/blank operand, no guard", AB, ["timestamp(self.a) <= timestamp(self.b)"], cmp("datetime", "le", "a", "b"), pairs([M, null, "", B])));
put(D, one("ts.le.guarded", "same, with has() guards", AB, ["!has(self.a) || !has(self.b) || timestamp(self.a) <= timestamp(self.b)"], cmp("datetime", "le", "a", "b"), pairs([M, null, "", B])));
put(D, one("ts.date.concat", "date strings via timestamp(a + 'T00:00:00Z')", { props: { a: { type: "string", format: "date" }, b: { type: "string", format: "date" } }, extra: REQ }, ["timestamp(self.a + 'T00:00:00Z') <= timestamp(self.b + 'T00:00:00Z')"], cmp("date", "le", "a", "b"), ts2([["2026-01-02", "2026-01-10"], ["2026-01-10", "2026-01-02"], ["2026-01-02", "2026-01-02"], ["2026-02-30", "2026-03-01"], ["2026-1-2", "2026-01-10"], ["0000-01-01", "2026-01-10"], ["2026-01-02T10:00:00Z", "2026-01-10"]])));
put(D, one("ts.lit", "timestamp(a) >= literal", { props: { a: S }, extra: { required: ["a"] } }, ["timestamp(self.a) >= timestamp('2026-01-01T00:00:00Z')"], cmp("datetime", "ge", "a", '#"2026-01-01T00:00:00Z"'), single("a", ["2025-12-31T23:59:59Z", "2026-01-01T00:00:00Z", "2026-01-01T01:00:00+02:00"])));


// native timestamp typing: format date / date-time fields are CEL timestamps already
const DT = { type: "string", format: "date-time" };
const DA = { type: "string", format: "date" };
const dpairs = [["2026-01-02", "2026-01-10"], ["2026-01-10", "2026-01-02"], ["2026-01-02", "2026-01-02"], ["0000-01-01", "2026-01-02"], ["9999-12-31", "2026-01-02"], ["2024-02-29", "2024-03-01"], ["2023-02-29", "2024-03-01"], ["2026-1-2", "2026-01-10"], ["2026-01-02T10:00:00Z", "2026-01-10"], ["", "2026-01-10"]];
put(D, one("ts.native.date", "format: date fields compared natively: a <= b", { props: { a: DA, b: DA }, extra: REQ }, ["self.a <= self.b"], cmp("date", "le", "a", "b"), ts2(dpairs)));
put(D, one("ts.wrapped.date", "format: date fields wrapped: timestamp(a) <= timestamp(b)", { props: { a: DA, b: DA }, extra: REQ }, ["timestamp(self.a) <= timestamp(self.b)"], cmp("date", "le", "a", "b"), ts2(dpairs)));
put(D, one("ts.native.date.guarded", "format: date optional, has() guards", { props: { a: DA, b: DA } }, ["!has(self.a) || !has(self.b) || self.a <= self.b"], cmp("date", "le", "a", "b"), pairs([M, null, "", "2026-01-02"])));
put(D, one("ts.native.date.unguarded", "format: date optional, no guard", { props: { a: DA, b: DA } }, ["self.a <= self.b"], cmp("date", "le", "a", "b"), pairs([M, null, "2026-01-02"])));
const tpairs = [["2026-01-02T10:00:00Z", B], ["2026-01-02T15:30:00+05:30", B], ["2026-01-02T10:00:00.0004Z", B], ["2026-01-02T10:00:00.123456789Z", B], ["2026-01-02T09:59:59-00:00", B], ["2026-01-02t10:00:00z", B], ["2026-01-02T10:00:00+24:00", B], ["0000-01-01T00:00:00Z", B], ["2026-01-02T10:00:00", B], ["2026-01-02", B], ["", B]];
put(D, one("ts.native.datetime", "format: date-time fields compared natively: a <= b", { props: { a: DT, b: DT }, extra: REQ }, ["self.a <= self.b"], cmp("datetime", "le", "a", "b"), ts2(tpairs)));
put(D, one("ts.native.datetime.gt", "native a > b: sub-ms", { props: { a: DT, b: DT }, extra: REQ }, ["self.a > self.b"], cmp("datetime", "gt", "a", "b"), ts2([["2026-01-02T10:00:00.0009Z", "2026-01-02T10:00:00.0001Z"], ["2026-01-02T10:00:01Z", B]])));
put(D, one("ts.native.datetime.guarded", "format: date-time optional, has() guards", { props: { a: DT, b: DT } }, ["!has(self.a) || !has(self.b) || self.a <= self.b"], cmp("datetime", "le", "a", "b"), pairs([M, null, "", B])));
put(D, one("ts.native.datetime.lit", "native a >= timestamp literal", { props: { a: DT }, extra: { required: ["a"] } }, ["self.a >= timestamp('2026-01-01T00:00:00Z')"], cmp("datetime", "ge", "a", '#"2026-01-01T00:00:00Z"'), single("a", ["2025-12-31T23:59:59Z", "2026-01-01T00:00:00Z", "2026-01-01T01:00:00+02:00"])));

// ---------- 6. groups ----------
const G = "60-groups.json";
const gv = [M, null, "", "x"];
const three = ["a", "b", "c"];
const grp = (id, desc, rule, vo, names = three, props = {}) =>
  put(G, one(id, desc, { props: Object.fromEntries(names.map((n) => [n, props[n] ?? S])) }, [rule], vo, inputs({}, names, gv)));
const HA = (names) => names.map((n) => `has(self.${n})`);
const ALO = "has(self.a) || has(self.b) || has(self.c)";
const EXO = `[${HA(three).join(", ")}].exists_one(x, x)`;
const AON2 = "has(self.a) == has(self.b)";
grp("grp.at_least_one.3", ALO, ALO, [{ kind: "at_least_one_of", fields: three }]);
grp("grp.at_least_one.2", "has(a)||has(b)", "has(self.a) || has(self.b)", [{ kind: "at_least_one_of", fields: ["a", "b"] }], ["a", "b"]);
grp("grp.exactly_one.exists_one", "exists_one form", EXO, [{ kind: "exactly_one_of", fields: three }]);
grp("grp.exactly_one.sum", "sum of ternaries == 1", "(has(self.a) ? 1 : 0) + (has(self.b) ? 1 : 0) + (has(self.c) ? 1 : 0) == 1", [{ kind: "exactly_one_of", fields: three }]);
grp("grp.all_or_none.2", AON2, AON2, [{ kind: "all_or_none", fields: ["a", "b"] }], ["a", "b"]);
grp("grp.all_or_none.3", "all(x,x) || all(x,!x)", `[${HA(three).join(", ")}].all(x, x) || [${HA(three).join(", ")}].all(x, !x)`, [{ kind: "all_or_none", fields: three }]);
grp("grp.all_or_none.3.alt", "none || all", "!(has(self.a) || has(self.b) || has(self.c)) || (has(self.a) && has(self.b) && has(self.c))", [{ kind: "all_or_none", fields: three }]);
const gm = { a: MIN, b: MIN, c: MIN };
const gn = { a: SN, b: SN, c: SN };
grp("grp.at_least_one.3.minLength1", "every field minLength 1", ALO, [{ kind: "at_least_one_of", fields: three }], three, gm);
grp("grp.exactly_one.exists_one.minLength1", "every field minLength 1", EXO, [{ kind: "exactly_one_of", fields: three }], three, gm);
grp("grp.all_or_none.2.minLength1", "every field minLength 1", AON2, [{ kind: "all_or_none", fields: ["a", "b"] }], ["a", "b"], gm);
grp("grp.at_least_one.3.nullable", "nullable fields", ALO, [{ kind: "at_least_one_of", fields: three }], three, gn);
grp("grp.exactly_one.exists_one.nullable", "nullable fields", EXO, [{ kind: "exactly_one_of", fields: three }], three, gn);
grp("grp.all_or_none.2.nullable", "nullable fields", AON2, [{ kind: "all_or_none", fields: ["a", "b"] }], ["a", "b"], gn);
const mixed = { a: { type: "array", items: S }, b: { type: "integer" }, c: { type: "boolean" } };
const objs = (list) => list.map((o) => ({ data: o, note: JSON.stringify(o) }));
const mixedCases = [{}, { a: [] }, { a: ["x"] }, { b: 0 }, { c: false }, { a: [], b: 0 }, { a: [], b: 0, c: true }, { a: ["x"], b: 1 }];
put(G, one("grp.at_least_one.mixed", "list / int / bool members", { props: mixed }, [ALO], [{ kind: "at_least_one_of", fields: three }], objs(mixedCases)));
put(G, one("grp.exactly_one.mixed", "list / int / bool members", { props: mixed }, [EXO], [{ kind: "exactly_one_of", fields: three }], objs(mixedCases)));
put(G, one("grp.all_or_none.mixed", "list / int / bool members", { props: mixed }, ["has(self.a) == has(self.b)"], [{ kind: "all_or_none", fields: ["a", "b"] }], objs(mixedCases)));


// ---------- 7. guard pairs: each rule shape with the guard holding and failing ----------
// `expect` is the intended outcome of the translator's guard: "translated" (guard holds, rule is exact)
// or "server_only" (guard fails, translating would be inexact).
const GD = "70-guards.json";
const gput = (id, expect, desc, sch, rules, vo, ins) => put(GD, { ...one(id, desc, sch, rules, vo, ins), expect });
const REQP = { required: ["plan"] };
const FS = [M, null, "", "x"];
// required_when: condition field required; target field blank-proof or not; defaulted or not.
gput("guard.rw.holds", "translated", "plan required, f minLength 1", { props: { plan: S, f: MIN }, extra: REQP }, [RULE_PRO], rwPro, [...single("f", FS, { plan: "pro" }), ...single("f", [M, "x"], { plan: "free" })]);
gput("guard.rw.fails.blankTarget", "server_only", "plan required, f plain string (\"\" is present)", { props: { plan: S, f: S }, extra: REQP }, [RULE_PRO], rwPro, [...single("f", FS, { plan: "pro" })]);
gput("guard.rw.fails.default", "server_only", "f has a default", { props: { plan: S, f: { type: "string", minLength: 1, default: "d" } }, extra: REQP }, [RULE_PRO], rwPro, single("f", [M, null, "x"], { plan: "pro" }));
gput("guard.rw.fails.optionalCond", "server_only", "plan optional: bare == errors on a missing plan", { props: { plan: S, f: MIN } }, [RULE_PRO], rwPro, [...single("f", [M, "x"], { plan: "pro" }), { data: {}, note: "plan=MISSING" }, { data: { f: "x" }, note: "plan=MISSING f=x" }]);
gput("guard.present.holds", "translated", "g and f minLength 1", { props: { g: MIN, f: MIN } }, ["!has(self.g) || has(self.f)"], [{ ...rwf, when: { present: { field: "g" } } }], inputs({}, ["g", "f"], [M, "x"]));
gput("guard.present.fails", "server_only", "g, f plain strings", { props: { g: S, f: S } }, ["!has(self.g) || has(self.f)"], [{ ...rwf, when: { present: { field: "g" } } }], inputs({}, ["g", "f"], [M, null, "", "x"]));
// compare number
gput("guard.num.holds.required", "translated", "both operands required", { ...IN2, extra: REQ }, ["self.a <= self.b"], cmp("number", "le", "a", "b"), inputs({}, ["a", "b"], [M, 0, 1, 2]));
gput("guard.num.holds.hasGuard", "translated", "has() guards", IN2, ["!has(self.a) || !has(self.b) || self.a <= self.b"], cmp("number", "le", "a", "b"), inputs({}, ["a", "b"], nv));
gput("guard.num.fails.optional", "server_only", "bare compare on optional operands", IN2, ["self.a <= self.b"], cmp("number", "le", "a", "b"), inputs({}, ["a", "b"], nv));
gput("guard.num.holds.literal", "translated", "required operand vs literal", { ...A1, extra: { required: ["a"] } }, ["self.a >= 0"], cmp("number", "ge", "a", "#0"), single("a", [M, -1, 0, 5]));
// compare string
gput("guard.str.holds", "translated", "required, minLength 1", { props: { a: MIN, b: MIN }, extra: REQ }, ["self.a < self.b"], cmp("string", "lt", "a", "b"), pairs([M, "", "a", "B", "\u{10000}", "\uffff", "e\u0301", "\u00e9"]));
gput("guard.str.fails.blank", "server_only", "required but \"\" allowed", { ...AB, extra: REQ }, ["self.a < self.b"], cmp("string", "lt", "a", "b"), pairs([M, "", "a", "b"]));
gput("guard.str.fails.optional", "server_only", "optional operands, bare", { props: { a: MIN, b: MIN } }, ["self.a < self.b"], cmp("string", "lt", "a", "b"), pairs([M, "a", "b"]));
// compare date / date-time
gput("guard.date.holds", "translated", "format: date, required", { props: { a: DA, b: DA }, extra: REQ }, ["self.a <= self.b"], cmp("date", "le", "a", "b"), ts2(dpairs.slice(0, 7)));
gput("guard.date.fails.optional", "server_only", "format: date, optional, bare", { props: { a: DA, b: DA } }, ["self.a <= self.b"], cmp("date", "le", "a", "b"), pairs([M, "2026-01-02"]));
const DTP = { type: "string", format: "date-time", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?(Z|[+-]\\d{2}:\\d{2})$" };
gput("guard.datetime.holds.pattern", "translated", "format: date-time + <=3 fraction digits, required", { props: { a: DTP, b: DTP }, extra: REQ }, ["self.a > self.b"], cmp("datetime", "gt", "a", "b"), ts2([["2026-01-02T10:00:00.009Z", "2026-01-02T10:00:00.001Z"], ["2026-01-02T15:30:00+05:30", B], ["2026-01-02T10:00:00.0009Z", "2026-01-02T10:00:00.0001Z"], ["2026-01-02T10:00:01Z", B]]));
gput("guard.datetime.fails.subms", "server_only", "format: date-time, no fraction limit", { props: { a: DT, b: DT }, extra: REQ }, ["self.a > self.b"], cmp("datetime", "gt", "a", "b"), ts2([["2026-01-02T10:00:00.0009Z", "2026-01-02T10:00:00.0001Z"], ["2026-01-02T10:00:01Z", B]]));
gput("guard.datetime.fails.plainString", "server_only", "plain string through timestamp()", { props: { a: S, b: S }, extra: REQ }, ["timestamp(self.a) <= timestamp(self.b)"], cmp("datetime", "le", "a", "b"), ts2([[B, B], ["", B], ["2026-01-02", B], ["2026-01-02T10:00:00.0004Z", B]]));
// groups
const gm3 = { a: MIN, b: MIN, c: MIN };
const grpG = (id, expect, desc, props, rule, vo, names = three) => gput(id, expect, desc, { props }, [rule], vo, inputs({}, names, gv));
grpG("guard.alo.holds", "translated", "minLength 1 members", gm3, ALO, [{ kind: "at_least_one_of", fields: three }]);
grpG("guard.alo.fails", "server_only", "plain string members", { a: S, b: S, c: S }, ALO, [{ kind: "at_least_one_of", fields: three }]);
grpG("guard.exo.holds", "translated", "minLength 1 members", gm3, EXO, [{ kind: "exactly_one_of", fields: three }]);
grpG("guard.exo.holds.sum", "translated", "sum-of-ternaries, minLength 1 members", gm3, "(has(self.a) ? 1 : 0) + (has(self.b) ? 1 : 0) + (has(self.c) ? 1 : 0) == 1", [{ kind: "exactly_one_of", fields: three }]);
grpG("guard.exo.fails", "server_only", "plain string members", { a: S, b: S, c: S }, EXO, [{ kind: "exactly_one_of", fields: three }]);
grpG("guard.exo.fails.default", "server_only", "one member has a default", { a: MIN, b: MIN, c: { ...MIN, default: "d" } }, EXO, [{ kind: "exactly_one_of", fields: three }]);
grpG("guard.aon.holds", "translated", "minLength 1 members", { a: MIN, b: MIN }, AON2, [{ kind: "all_or_none", fields: ["a", "b"] }], ["a", "b"]);
grpG("guard.aon.fails", "server_only", "plain string members", { a: S, b: S }, AON2, [{ kind: "all_or_none", fields: ["a", "b"] }], ["a", "b"]);

for (const [f, cs] of Object.entries(files)) writeFileSync(join(out, f), `${JSON.stringify(cs, null, 1).replace(/(?<!\\)"RAW:([^"]+)"/g, "$1")}\n`);
console.log(Object.entries(files).map(([f, cs]) => `${f}: ${cs.length} cases, ${cs.reduce((n, c) => n + c.inputs.length, 0)} inputs`).join("\n"));
