// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// generate_code: turns a rule set into builder source (C#, Python) or client wiring (Zod,
// react-hook-form, Angular Reactive Forms). Pure text templates; nothing is executed or written.

import { type Condition, type Rule, type RuleSet, ValidonceFormatError, parseRuleSet } from "validonce";
import { fieldsOf } from "./rules";
import { ToolError } from "./sdk";

export const TARGETS = ["csharp", "python", "zod", "react-hook-form", "angular-reactive", "go", "java", "typescript-rules", "vue", "dom"] as const;
export type Target = (typeof TARGETS)[number];
export const NAMINGS = ["auto", "pascal", "camel", "snake", "identity"] as const;
export type Naming = (typeof NAMINGS)[number];

export interface CodegenInput {
  rules: unknown;
  target: Target;
  /** Model / class name. Default "Model". */
  modelName?: string;
  /** C# namespace. Default none (a file-scoped namespace is written only when given). */
  namespace?: string;
  /** JSON Schema `properties`, used for field types. */
  properties?: Record<string, unknown>;
  /** Explicit wire name -> property/attribute name. Wins over `naming`. */
  propertyNames?: Record<string, string>;
  /** Default: pascal for csharp, snake for python, identity otherwise. */
  naming?: Naming;
  /** Also write the model class (csharp, python) or a base-schema skeleton (zod, react-hook-form). */
  includeModel?: boolean;
  /** typescript-rules only: which server framework to wire. Default "fastify". */
  framework?: "fastify" | "nestjs";
}

export interface GeneratedFile {
  path: string;
  language: "go" | "java" | "typescript" | "vue" | "html";
  source: string;
}

export interface Unexpressible {
  ruleId: string;
  reason: string;
}

export interface CodegenResult {
  target: Target;
  language: "csharp" | "python" | "typescript" | "go" | "java";
  /** The generated code. For targets that write several files (java, vue, dom) this is the primary file, or all files joined (java). */
  source: string;
  /** Every file the target writes (go, java, typescript-rules, vue, dom). */
  files?: GeneratedFile[];
  /** false when some rules could not be written with the builders; they appear as comments. */
  complete: boolean;
  unexpressible: Unexpressible[];
  notes: string[];
  /** wire name -> generated property / attribute name */
  names: Record<string, string>;
}

// ---------------------------------------------------------------- field typing

type Kind = "string" | "number" | "integer" | "bool" | "date" | "datetime";

interface FieldInfo {
  wire: string;
  kind: Kind;
  /** The type came from `properties` or a compare rule, not just from a literal value. */
  known: boolean;
  /** Compare rules on this field disagree on type, or a literal contradicts the type. */
  conflict?: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function kindFromSchema(prop: unknown): Kind | undefined {
  const p = (prop ?? {}) as { type?: unknown; format?: unknown };
  const types = (Array.isArray(p.type) ? p.type : [p.type]).filter((t): t is string => typeof t === "string" && t !== "null");
  const t = types[0];
  if (t === "integer") return "integer";
  if (t === "number") return "number";
  if (t === "boolean") return "bool";
  if (t === "string") return p.format === "date" ? "date" : p.format === "date-time" ? "datetime" : "string";
  return undefined;
}

function compareKind(t: string): Kind {
  return t === "number" ? "number" : (t as Kind);
}

function isNumberish(k: Kind) {
  return k === "number" || k === "integer";
}

function conditionValues(c: Condition, out: Array<{ field: string; value: unknown }>): void {
  if ("eq" in c) out.push({ field: c.eq.field, value: c.eq.value });
  else if ("ne" in c) out.push({ field: c.ne.field, value: c.ne.value });
  else if ("in" in c) for (const v of c.in.values) out.push({ field: c.in.field, value: v });
  else if ("all" in c) for (const x of c.all) conditionValues(x, out);
  else if ("any" in c) for (const x of c.any) conditionValues(x, out);
  else if ("not" in c) conditionValues(c.not, out);
}

function kindOfValue(v: unknown): Kind {
  return typeof v === "number" ? "number" : typeof v === "boolean" ? "bool" : "string";
}

function inferFields(rules: Rule[], properties: Record<string, unknown> | undefined): Map<string, FieldInfo> {
  const out = new Map<string, FieldInfo>();
  const ensure = (wire: string) => {
    let f = out.get(wire);
    if (!f) {
      const k = properties && Object.hasOwn(properties, wire) ? kindFromSchema(properties[wire]) : undefined;
      f = { wire, kind: k ?? "string", known: k !== undefined };
      out.set(wire, f);
    }
    return f;
  };
  for (const r of rules) {
    for (const w of fieldsOf(r)) ensure(w);
    if (r.path !== undefined) ensure(r.path);
  }
  for (const r of rules) {
    if (r.kind === "compare") {
      const want = compareKind(r.type);
      for (const w of [r.left.field, ..."field" in r.right ? [r.right.field] : []]) {
        const f = ensure(w);
        if (!f.known) {
          f.kind = want;
          f.known = true;
        } else if (f.kind !== want && !(isNumberish(f.kind) && want === "number")) {
          f.conflict = `compare type "${r.type}" but the field is ${f.kind}`;
        }
      }
    }
  }
  const vals: Array<{ field: string; value: unknown }> = [];
  for (const r of rules) if (r.kind === "required_when") conditionValues(r.when, vals);
  for (const { field, value } of vals) {
    const f = ensure(field);
    const vk = kindOfValue(value);
    if (!f.known) {
      f.kind = vk;
      f.known = true;
    } else if (vk === "string" && (f.kind === "string" || f.kind === "date" || f.kind === "datetime")) {
      // fine: a string literal for a string/date field
    } else if (vk === "number" && isNumberish(f.kind)) {
      // fine
    } else if (vk !== f.kind) {
      f.conflict ??= `literal ${JSON.stringify(value)} is a ${vk} but the field is ${f.kind}`;
    }
  }
  return out;
}

// ---------------------------------------------------------------- naming

function words(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

const pascalOf = (s: string) => words(s).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
const camelOf = (s: string) => {
  const p = pascalOf(s);
  return p ? p[0]!.toLowerCase() + p.slice(1) : p;
};
const snakeOf = (s: string) => words(s).map((w) => w.toLowerCase()).join("_");

/** System.Text.Json's camelCase policy: lower-case the leading run of capitals (JsonNamingPolicy.CamelCase). */
function stjCamel(name: string): string {
  const chars = [...name];
  for (let i = 0; i < chars.length; i++) {
    if (i === 1 && !/[A-Z]/.test(chars[i]!)) break;
    const hasNext = i + 1 < chars.length;
    if (i > 0 && hasNext && !/[A-Z]/.test(chars[i + 1]!)) {
      if (chars[i + 1] === " ") chars[i] = chars[i]!.toLowerCase();
      break;
    }
    chars[i] = chars[i]!.toLowerCase();
  }
  return chars.join("");
}

const CS_KEYWORDS = new Set(
  "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while".split(" "),
);
const PY_KEYWORDS = new Set(
  "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case type".split(" "),
);
// Attributes of pydantic.BaseModel (and our own helpers) a field must not shadow.
const PY_RESERVED = new Set(
  "copy dict json schema schema_json validate construct parse_obj parse_raw parse_file from_orm update_forward_refs fields export_rules model_config model_fields".split(" "),
);

function uniqueNames(
  wires: string[],
  explicit: Record<string, string> | undefined,
  make: (wire: string) => string,
  taken: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set(taken);
  for (const w of wires) {
    const e = explicit?.[w];
    if (e !== undefined) {
      out[w] = e;
      used.add(e);
    }
  }
  for (const w of wires) {
    if (out[w] !== undefined) continue;
    let n = make(w);
    const base = n;
    for (let i = 2; used.has(n); i++) n = `${base}${i}`;
    used.add(n);
    out[w] = n;
  }
  return out;
}

// ---------------------------------------------------------------- literals

const q = (s: string) => JSON.stringify(s);

function pyStr(s: string): string {
  let o = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '"') o += '\\"';
    else if (ch === "\\") o += "\\\\";
    else if (ch === "\n") o += "\\n";
    else if (ch === "\r") o += "\\r";
    else if (ch === "\t") o += "\\t";
    else if (c < 0x20 || c === 0x7f || (c >= 0xd800 && c <= 0xdfff)) o += `\\u${c.toString(16).padStart(4, "0")}`;
    else o += ch;
  }
  return o + '"';
}

function pyVal(v: unknown): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v);
  return pyStr(String(v));
}

const csNum = (n: number) => (Number.isInteger(n) && Math.abs(n) < 2 ** 31 ? String(n) : n.toString().toUpperCase().replace("E+", "E"));

function ident(s: string, keywords: Set<string>, fallback: string): string {
  let n = s.replace(/[^A-Za-z0-9_]/g, "");
  if (!n) n = fallback;
  if (/^[0-9]/.test(n)) n = `_${n}`;
  if (keywords.has(n)) n = `${n}_`;
  return n;
}

// ---------------------------------------------------------------- C#

const CS_OP: Record<string, string> = { lt: "Lt", le: "Le", gt: "Gt", ge: "Ge", eq: "Eq", ne: "Ne" };

function csType(k: Kind): string {
  switch (k) {
    case "number": return "double?";
    case "integer": return "long?";
    case "bool": return "bool?";
    case "date": return "DateOnly?";
    case "datetime": return "DateTimeOffset?";
    default: return "string?";
  }
}

class Skip extends Error {}

function genCSharp(set: RuleSet, input: CodegenInput, fields: Map<string, FieldInfo>, model: string): CodegenResult {
  const notes: string[] = [];
  const unexpressible: Unexpressible[] = [];
  const naming = input.naming ?? "auto";
  const toName = (w: string) => ident(naming === "camel" ? camelOf(w) : naming === "snake" ? snakeOf(w) : naming === "identity" ? w : pascalOf(w), CS_KEYWORDS, "Field");
  const names = uniqueNames([...fields.keys()], input.propertyNames, (w) => {
    const n = toName(w);
    return n === model ? `${n}Value` : n;
  }, new Set([model, `${model}Validator`]));
  const prop = (w: string) => `x => x.${names[w]}`;

  const value = (f: FieldInfo, v: unknown): string => {
    if (typeof v === "boolean") {
      if (f.kind !== "bool") throw new Skip(`literal ${v} on a ${f.kind} field`);
      return `${v}`;
    }
    if (typeof v === "number") {
      if (!isNumberish(f.kind)) throw new Skip(`number literal ${v} on a ${f.kind} field`);
      return csNum(v);
    }
    const s = String(v);
    if (f.kind === "string") return q(s);
    if (f.kind === "date") {
      const m = DATE_RE.exec(s);
      if (!m) throw new Skip(`literal ${q(s)} is not a date`);
      return `new DateOnly(${Number(m[1])}, ${Number(m[2])}, ${Number(m[3])})`;
    }
    if (f.kind === "datetime") {
      if (!DATETIME_RE.test(s)) throw new Skip(`literal ${q(s)} is not a datetime`);
      return `DateTimeOffset.Parse(${q(s)}, System.Globalization.CultureInfo.InvariantCulture)`;
    }
    throw new Skip(`string literal ${q(s)} on a ${f.kind} field`);
  };
  const ftype = (w: string) => {
    const f = fields.get(w)!;
    if (f.conflict) throw new Skip(`field "${w}": ${f.conflict}`);
    return f;
  };
  // Explicit type arguments keep int literals and nullable properties from confusing inference.
  const tArg = (f: FieldInfo) => (f.kind === "string" ? "" : `<${csType(f.kind)}>`);

  const cond = (c: Condition): string => {
    if ("eq" in c) { const f = ftype(c.eq.field); return `If.Eq${tArg(f)}(${prop(c.eq.field)}, ${value(f, c.eq.value)})`; }
    if ("ne" in c) { const f = ftype(c.ne.field); return `If.Ne${tArg(f)}(${prop(c.ne.field)}, ${value(f, c.ne.value)})`; }
    if ("in" in c) { const f = ftype(c.in.field); return `If.In${tArg(f)}(${prop(c.in.field)}, ${c.in.values.map((v) => value(f, v)).join(", ")})`; }
    if ("present" in c) return `If.Present(${prop(c.present.field)})`;
    if ("absent" in c) return `If.Absent(${prop(c.absent.field)})`;
    if ("all" in c) return `If.All(${c.all.map(cond).join(", ")})`;
    if ("any" in c) return `If.Any(${c.any.map(cond).join(", ")})`;
    return `If.Not(${cond(c.not)})`;
  };

  const at = (r: Rule): string => (r.path !== undefined ? `.AtPath(${prop(r.path)})` : "");

  const tail = (r: Rule, primary: string): string => {
    let s = "";
    const defId = `${model}.${r.kind}.${primary}`;
    if (r.id !== defId) s += `.WithRuleId(${q(r.id)})`;
    const p = r.message.params;
    if (p && Object.keys(p).length > 0) {
      const items = Object.entries(p).map(([k, v]) => `[${q(k)}] = ${v === null ? "null" : typeof v === "number" ? csNum(v) : typeof v === "boolean" ? String(v) : q(String(v))}`);
      s += `.WithMessageKey(${q(r.message.key)}, new Dictionary<string, object?> { ${items.join(", ")} })`;
    } else {
      s += `.WithMessageKey(${q(r.message.key)})`;
    }
    if (r.server_only) s += ".ServerOnly()";
    return s;
  };

  const lines: string[] = [];
  for (const r of set.rules) {
    try {
      if (r.kind === "required_when") {
        lines.push(`RequiredWhen(${prop(r.field)}, ${cond(r.when)})${at(r)}${tail(r, r.field)};`);
      } else if (r.kind === "compare") {
        const l = ftype(r.left.field);
        const want = compareKind(r.type);
        if (!(l.kind === want || (isNumberish(l.kind) && want === "number"))) throw new Skip(`compare type "${r.type}" does not match the ${l.kind} property`);
        if (r.type === "datetime" && "value" in r.right) notes.push(`${r.id}: a DateTimeOffset constant is re-serialized by System.Text.Json (offset "Z" becomes "+00:00", fraction digits are normalized).`);
        if ("field" in r.right) {
          const rt = ftype(r.right.field);
          const same = rt.kind === l.kind || (isNumberish(rt.kind) && isNumberish(l.kind));
          if (!same) throw new Skip(`properties "${r.left.field}" (${l.kind}) and "${r.right.field}" (${rt.kind}) have different compare types`);
          lines.push(`Compare(${prop(r.left.field)}, CompareOp.${CS_OP[r.op]}, ${prop(r.right.field)})${at(r)}${tail(r, r.left.field)};`);
        } else {
          lines.push(`Compare(${prop(r.left.field)}, CompareOp.${CS_OP[r.op]}, ${value(l, r.right.value)})${at(r)}${tail(r, r.left.field)};`);
        }
      } else {
        const fs = r.fields.map((w) => { ftype(w); return prop(w); }).join(", ");
        const method = { at_least_one_of: "AtLeastOneOf", exactly_one_of: "ExactlyOneOf", all_or_none: "AllOrNone" }[r.kind];
        lines.push(`${method}(${fs})${at(r)}${tail(r, r.fields[0]!)};`);
      }
    } catch (e) {
      if (!(e instanceof Skip)) throw e;
      unexpressible.push({ ruleId: r.id, reason: e.message });
      lines.push(`// NOT EXPRESSIBLE with the builders: ${r.id} (${e.message}). Keep it hand-written.`);
    }
  }

  const ns = input.namespace;
  const ind = "";
  const out: string[] = [];
  out.push("using System.Text.Json.Serialization;", "using Validonce;", "using Validonce.FluentValidation;", "");
  if (ns) out.push(`namespace ${ns};`, "");
  const wantModel = input.includeModel ?? true;
  if (wantModel) {
    out.push(`public sealed class ${model}`, "{");
    for (const [w, f] of fields) {
      const n = names[w]!;
      const needsAttr = stjCamel(n) !== w; // validators use the default camelCase wire names
      out.push(`    ${needsAttr ? `[JsonPropertyName(${q(w)})] ` : ""}public ${csType(f.kind)} ${n} { get; set; }`);
    }
    out.push("}", "");
  } else {
    const off = [...fields.keys()].filter((w) => stjCamel(names[w]!) !== w);
    if (off.length)
      notes.push(`Your model needs [JsonPropertyName] (or a naming policy) so these properties serialize to the rule wire names: ${off.map((w) => `${names[w]} -> "${w}"`).join(", ")}.`);
    notes.push("Property types are not generated: Compare infers its type from your property types (number, string, DateOnly, DateTimeOffset); a mismatch throws when the validator is constructed.");
  }
  out.push(`public sealed class ${model}Validator : ValidonceValidator<${model}>`, "{", `    public ${model}Validator()`, "    {");
  for (const l of lines) out.push(`        ${l}`);
  out.push("    }", "}", "");
  void ind;
  return {
    target: "csharp",
    language: "csharp",
    source: out.join("\n"),
    complete: unexpressible.length === 0,
    unexpressible,
    notes,
    names,
  };
}

// ---------------------------------------------------------------- Python

function pyType(k: Kind): string {
  switch (k) {
    case "number": return "float | None";
    case "integer": return "int | None";
    case "bool": return "bool | None";
    case "date": return "date | None";
    case "datetime": return "AwareDatetime | None";
    default: return "str | None";
  }
}

function genPython(set: RuleSet, input: CodegenInput, fields: Map<string, FieldInfo>, model: string): CodegenResult {
  const notes: string[] = [];
  const unexpressible: Unexpressible[] = [];
  const naming = input.naming ?? "auto";
  const toAttr = (w: string): string => {
    const valid = /^[A-Za-z][A-Za-z0-9_]*$/.test(w);
    let n = naming === "identity" || (naming === "auto" && valid) ? w : naming === "camel" ? camelOf(w) : naming === "pascal" ? pascalOf(w) : snakeOf(w);
    n = ident(n, PY_KEYWORDS, "field");
    if (n.startsWith("_")) n = `f${n}`;
    if (PY_RESERVED.has(n) || n.startsWith("model_")) n = `${n}_`;
    return n;
  };
  const names = uniqueNames([...fields.keys()], input.propertyNames, toAttr, new Set([model]));
  const ref = (w: string) => `F.${names[w]}`;
  const wantModel = input.includeModel ?? true;
  const typeKnown = wantModel || input.properties !== undefined;
  const used = new Set<string>(["F"]);

  const pyKindOf = (w: string): Kind => fields.get(w)!.kind;
  const cmpTypeOf = (k: Kind) => (k === "integer" || k === "number" ? "number" : k === "bool" ? "bool" : k);

  const cond = (c: Condition): string => {
    if ("eq" in c) return `${ref(c.eq.field)} == ${pyVal(c.eq.value)}`;
    if ("ne" in c) return `${ref(c.ne.field)} != ${pyVal(c.ne.value)}`;
    if ("in" in c) return `${ref(c.in.field)}.is_in([${c.in.values.map(pyVal).join(", ")}])`;
    if ("present" in c) return `${ref(c.present.field)}.present()`;
    if ("absent" in c) return `${ref(c.absent.field)}.absent()`;
    if ("all" in c) { used.add("all_of"); return `all_of(${c.all.map(cond).join(", ")})`; }
    if ("any" in c) { used.add("any_of"); return `any_of(${c.any.map(cond).join(", ")})`; }
    used.add("not_");
    return `not_(${cond(c.not)})`;
  };

  const tail = (r: Rule, defaultPath: string): string => {
    let s = `key=${pyStr(r.message.key)}`;
    const p = r.message.params;
    if (p !== undefined) s += `, params={${Object.entries(p).map(([k, v]) => `${pyStr(k)}: ${pyVal(v)}`).join(", ")}}`;
    const eff = r.path ?? defaultPath;
    if (r.id !== `${model}.${r.kind}.${eff}`) s += `, id=${pyStr(r.id)}`;
    if (r.server_only) s += ", server_only=True";
    if (r.path !== undefined) s += `, path=${ref(r.path)}`;
    return s;
  };

  const lines: string[] = [];
  for (const r of set.rules) {
    if (r.kind === "required_when") {
      used.add("when");
      lines.push(`when(${cond(r.when)}).require(${ref(r.field)}, ${tail(r, r.field)}),`);
    } else if (r.kind === "compare") {
      const right = "field" in r.right ? ref(r.right.field) : pyVal(r.right.value);
      const mismatch = cmpTypeOf(pyKindOf(r.left.field)) !== r.type || fields.get(r.left.field)!.conflict !== undefined;
      const rightMismatch = "field" in r.right && cmpTypeOf(pyKindOf(r.right.field)) !== r.type;
      const typeArg = !typeKnown || mismatch || rightMismatch ? `, type=${pyStr(r.type)}` : "";
      lines.push(`${ref(r.left.field)}.${r.op}(${right}, ${tail(r, r.left.field)}${typeArg}),`);
    } else {
      used.add(r.kind);
      lines.push(`${r.kind}(${r.fields.map(ref).join(", ")}, ${tail(r, r.fields[0]!)}),`);
    }
  }

  const kinds = new Set([...fields.values()].map((f) => f.kind));
  const out: string[] = [];
  if (wantModel && kinds.has("date")) out.push("from datetime import date");
  const pyd: string[] = [];
  if (wantModel && kinds.has("datetime")) pyd.push("AwareDatetime");
  const aliased = [...fields.keys()].some((w) => names[w] !== w);
  if (wantModel && aliased) pyd.push("Field");
  if (pyd.length) out.push(`from pydantic import ${pyd.join(", ")}`);
  out.push(`from validonce import ${[...used].sort((a, b) => (a === "F" ? -1 : b === "F" ? 1 : a.localeCompare(b))).join(", ")}${wantModel ? ", ValidonceModel" : ""}`, "", "");
  out.push(`class ${model}${wantModel ? "(ValidonceModel)" : ""}:`);
  if (wantModel) {
    for (const [w, f] of fields) {
      const n = names[w]!;
      out.push(n === w ? `    ${n}: ${pyType(f.kind)} = None` : `    ${n}: ${pyType(f.kind)} = Field(default=None, alias=${pyStr(w)})`);
    }
    out.push("");
  } else {
    notes.push(`Paste __rules__ into your own ValidonceModel subclass. Rules refer to fields by attribute name (F.x); the names generated here are ${Object.entries(names).filter(([w, n]) => w !== n).map(([w, n]) => `${n} (wire "${w}")`).join(", ") || "the wire names"}. Compare types come from your annotations, so \`type=\` is written on every compare.`);
  }
  out.push("    __rules__ = [");
  for (const l of lines) out.push(`        ${l}`);
  out.push("    ]", "");
  return { target: "python", language: "python", source: out.join("\n"), complete: true, unexpressible, notes, names };
}

// ---------------------------------------------------------------- clients (TypeScript)

function tsRules(set: RuleSet): string {
  return JSON.stringify(set, null, 2);
}

function messageCatalog(set: RuleSet): string {
  const keys = [...new Set(set.rules.map((r) => r.message.key))];
  return `{\n${keys.map((k) => `  ${q(k)}: ${q(`TODO: text for ${k}`)},`).join("\n")}\n}`;
}

function zodField(f: FieldInfo): string {
  switch (f.kind) {
    case "number": return "z.number().nullable().optional()";
    case "integer": return "z.number().int().nullable().optional()";
    case "bool": return "z.boolean().nullable().optional()";
    case "date": return "isoDate().nullable().optional()";
    case "datetime": return "isoDateTime().nullable().optional()";
    default: return "z.string().nullable().optional()";
  }
}

function genClient(set: RuleSet, input: CodegenInput, fields: Map<string, FieldInfo>, model: string): CodegenResult {
  const target = input.target;
  const base = `${camelOf(model) || "model"}Base`;
  const schema = `${camelOf(model) || "model"}Schema`;
  const wantModel = input.includeModel ?? false;
  const notes: string[] = [];
  const out: string[] = [];
  const names: Record<string, string> = Object.fromEntries([...fields.keys()].map((w) => [w, w]));
  const clientRules: RuleSet = { version: 1, rules: set.rules };

  if (target === "angular-reactive") {
    out.push(
      `import { FormControl, FormGroup } from "@angular/forms";`,
      `import type { RuleSet } from "validonce";`,
      `import { validonceGroupValidator } from "validonce/angular";`,
      "",
      `const rules = ${tsRules(clientRules)} as const satisfies RuleSet;`,
      "",
      `const messages = ${messageCatalog(set)};`,
      "",
      `export const ${camelOf(model) || "model"}Group = () =>`,
      "  new FormGroup(",
      `    { ${[...fields.keys()].map((w) => `${/^[A-Za-z_$][\w$]*$/.test(w) ? w : q(w)}: new FormControl("")`).join(", ")} },`,
      "    { validators: validonceGroupValidator(rules, { messages }) },",
      "  );",
      "",
    );
    notes.push("One validator per FormGroup. It runs on group.getRawValue(): dates must be ISO strings and an empty input (\"\") is blank. server_only rules are skipped on the client.");
  } else {
    out.push(`import { z } from "zod";`);
    if (target === "react-hook-form") out.push(`import { zodResolver } from "@hookform/resolvers/zod";`, `import { useForm } from "react-hook-form";`);
    out.push(`import type { RuleSet } from "validonce";`);
    if (target === "react-hook-form") out.push(`import { registerDeps } from "validonce/react-hook-form";`);
    const isoHelpers = wantModel
      ? [...new Set([...fields.values()].flatMap((f) => (f.kind === "date" ? ["isoDate"] : f.kind === "datetime" ? ["isoDateTime"] : [])))].sort()
      : [];
    out.push(`import { ${[...isoHelpers, "withRules"].join(", ")} } from "validonce/zod";`, "");
    out.push(`const rules = ${tsRules(clientRules)} as const satisfies RuleSet;`, "", `const messages = ${messageCatalog(set)};`, "");
    if (wantModel) {
      out.push(`// Skeleton: replace with your real schema (field-level checks stay there).`, `const ${base} = z.object({`);
      for (const [w, f] of fields) out.push(`  ${/^[A-Za-z_$][\w$]*$/.test(w) ? w : q(w)}: ${zodField(f)},`);
      out.push("});", "");
    } else {
      notes.push(`\`${base}\` is your existing z.object(...) schema; every field named by a rule must exist in it or withRules throws.`);
    }
    out.push(`export const ${schema} = withRules(${base}, rules, { messages });`, "");
    if (target === "react-hook-form") {
      const fl = [...fields.keys()].map(q).join(" | ");
      out.push(
        `type Field = ${fl};`,
        "",
        "// In the component:",
        `//   const deps = registerDeps<Field>(rules);   // re-check dependent fields when one changes`,
        `//   const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(${schema}), mode: "onChange" });`,
        `//   <input {...register("${[...fields.keys()][0] ?? "field"}", { ...deps("${[...fields.keys()][0] ?? "field"}") })} />`,
        "export const useModelForm = () => useForm({ resolver: zodResolver(" + schema + "), mode: \"onChange\" });",
        "export const deps = registerDeps<Field>(rules);",
        "",
      );
      notes.push("registerDeps lists, per field, the other fields to re-check when it changes (react-hook-form validates only the changed field).");
    }
    notes.push("withRules skips server_only rules; they still run on the server.");
  }
  void [...fields];
  return { target, language: "typescript", source: out.join("\n"), complete: true, unexpressible: [], notes, names };
}

// ---------------------------------------------------------------- entry

export function generateCode(input: CodegenInput): CodegenResult {
  let set: RuleSet;
  try {
    set = parseRuleSet(input.rules);
  } catch (e) {
    throw new ToolError(`Invalid rule set: ${e instanceof ValidonceFormatError ? e.message : "unreadable"}`);
  }
  let model = ident(input.modelName ?? "Model", input.target === "python" ? PY_KEYWORDS : CS_KEYWORDS, "Model");
  if (input.target === "go" || input.target === "java") model = model.replace(/^_+/, "").replace(/^[a-z]/, (c) => c.toUpperCase()) || "Model";
  const fields = inferFields(set.rules, input.properties);
  if (fields.size === 0) throw new ToolError("The rule set has no rules.");
  switch (input.target) {
    case "go": return genGo(set, input, fields, model);
    case "java": return genJava(set, input, fields, model);
    case "typescript-rules": return genTsRules(set, input, fields, model);
    case "vue": return genVue(set, input, fields, model);
    case "dom": return genDom(set, input, fields, model);
    case "csharp": return genCSharp(set, input, fields, model);
    case "python": return genPython(set, input, fields, model);
    default: return genClient(set, input, fields, model);
  }
}

// ---------------------------------------------------------------- shared helpers (go, java, ts)

const isIdent = (w: string) => /^[A-Za-z_$][\w$]*$/.test(w);
const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);
const hasLoneSurrogate = (s: string) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s);
const defaultId = (model: string, r: Rule, path: string) => `${model}.${r.kind}.${path}`;
const firstField = (r: Rule): string => (r.kind === "required_when" ? r.field : r.kind === "compare" ? r.left.field : r.fields[0]!);
const hq = (s: string) => `"${s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/{/g, "&#123;")}"`;
const ht = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/{/g, "&#123;");
const opName = (op: string) => op[0]!.toUpperCase() + op.slice(1);

// ---------------------------------------------------------------- Go

const GO_KEYWORDS = new Set("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var".split(" "));

function goTagOk(w: string): boolean {
  if (w === "" || w === "-") return false;
  for (const ch of w) if (!/[\p{L}\p{N}]/u.test(ch) && !"!#$%&()*+-./:;<=>?@[]^_{|}~ ".includes(ch)) return false;
  return true;
}

function goType(k: Kind): { type: string; tag: string } {
  switch (k) {
    case "number": return { type: "*float64", tag: "" };
    case "integer": return { type: "*int64", tag: "" };
    case "bool": return { type: "*bool", tag: "" };
    case "date": return { type: "*string", tag: ' format:"date"' };
    case "datetime": return { type: "*string", tag: ' format:"date-time"' };
    default: return { type: "*string", tag: "" };
  }
}

function genGo(set: RuleSet, input: CodegenInput, fields: Map<string, FieldInfo>, model: string): CodegenResult {
  const notes: string[] = [];
  const unexpressible: Unexpressible[] = [];
  const naming = input.naming ?? "auto";
  const toName = (w: string) => {
    const base = naming === "identity" ? w.replace(/[^A-Za-z0-9_]/g, "") : pascalOf(w).replace(/[^A-Za-z0-9]/g, "");
    let n = /^[A-Z]/.test(base) ? base : `F${base}`;
    if (GO_KEYWORDS.has(n)) n = `${n}_`;
    return n;
  };
  const names = uniqueNames([...fields.keys()], input.propertyNames, toName, new Set([model, `${model}Rules`]));
  const pkg = input.namespace ?? "models";
  const varName = `${model}Rules`;
  const wantModel = input.includeModel ?? true;

  const gq = (s: string): string => {
    if (hasLoneSurrogate(s)) throw new Skip("a string literal contains a lone surrogate, which Go cannot write");
    return JSON.stringify(s).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  };
  const gnum = (n: number) => (Number.isInteger(n) && Math.abs(n) >= 2 ** 31 ? `float64(${String(n)})` : String(n));
  const gval = (v: unknown): string => (v === null ? "nil" : typeof v === "number" ? gnum(v) : typeof v === "boolean" ? String(v) : gq(String(v)));
  const goKindOf = (w: string): string => (fields.get(w)!.kind === "integer" ? "number" : fields.get(w)!.kind);

  const cond = (c: Condition): string => {
    if ("eq" in c) return `validonce.Eq(${gq(c.eq.field)}, ${gval(c.eq.value)})`;
    if ("ne" in c) return `validonce.Ne(${gq(c.ne.field)}, ${gval(c.ne.value)})`;
    if ("in" in c) return `validonce.In(${[gq(c.in.field), ...c.in.values.map(gval)].join(", ")})`;
    if ("present" in c) return `validonce.Present(${gq(c.present.field)})`;
    if ("absent" in c) return `validonce.Absent(${gq(c.absent.field)})`;
    if ("all" in c) return `validonce.AllOf(${c.all.map(cond).join(", ")})`;
    if ("any" in c) return `validonce.AnyOf(${c.any.map(cond).join(", ")})`;
    return `validonce.Not(${cond(c.not)})`;
  };
  const opts = (r: Rule, path: string, extra: string[] = []): string => {
    const o = [`validonce.Key(${gq(r.message.key)})`];
    const p = r.message.params;
    if (p !== undefined) o.push(`validonce.Params(map[string]any{${Object.entries(p).map(([k, v]) => `${gq(k)}: ${gval(v)}`).join(", ")}})`);
    if (r.id !== defaultId(model, r, path)) o.push(`validonce.ID(${gq(r.id)})`);
    if (r.path !== undefined) o.push(`validonce.Path(${gq(r.path)})`);
    if (r.server_only) o.push("validonce.ServerOnly()");
    o.push(...extra);
    return o.join(", ");
  };

  const lines: string[] = [];
  for (const r of set.rules) {
    try {
      for (const w of new Set([...fieldsOf(r), ...(r.path !== undefined ? [r.path] : [])]))
        if (!goTagOk(w)) throw new Skip(`field "${w}" cannot be written in a Go json tag`);
      const path = r.path ?? firstField(r);
      if (r.kind === "required_when") {
        lines.push(`validonce.When(${cond(r.when)}).Require(${gq(r.field)}, ${opts(r, path)}),`);
      } else if (r.kind === "compare") {
        const sides = [r.left.field, ..."field" in r.right ? [r.right.field] : []];
        for (const w of sides) {
          const k = goKindOf(w);
          const ok = r.type === "number" ? k === "number" : r.type === "string" ? k === "string" : k === "string" || k === "date" || k === "datetime";
          if (!ok) throw new Skip(`compare type "${r.type}" does not fit field "${w}" (${fields.get(w)!.kind})`);
        }
        const inferred = goKindOf(r.left.field);
        const as = inferred === r.type ? [] : [`validonce.As(${gq(r.type)})`];
        const right = "field" in r.right ? `validonce.Ref(${gq(r.right.field)})` : `validonce.Val(${gval(r.right.value)})`;
        lines.push(`validonce.Cmp(${gq(r.left.field)}).${opName(r.op)}(${right}, ${opts(r, path, as)}),`);
      } else {
        const fn = { at_least_one_of: "AtLeastOneOf", exactly_one_of: "ExactlyOneOf", all_or_none: "AllOrNone" }[r.kind];
        lines.push(`validonce.${fn}([]string{${r.fields.map(gq).join(", ")}}, ${opts(r, path)}),`);
      }
    } catch (e) {
      if (!(e instanceof Skip)) throw e;
      unexpressible.push({ ruleId: r.id, reason: e.message });
      lines.push(`// NOT EXPRESSIBLE with the builders: ${r.id.replace(/[\r\n]/g, " ")} (${e.message.replace(/[\r\n]/g, " ")}). Keep it hand-written.`);
    }
  }

  const out: string[] = [`package ${pkg}`, "", `import validonce "github.com/metatoy/validonce/go"`, ""];
  if (wantModel) {
    out.push(`// ${model} is the wire model. The json tags are the field names the rules use.`, `type ${model} struct {`);
    const w = Math.max(...[...fields.keys()].map((x) => names[x]!.length));
    for (const [wire, f] of fields) {
      const t = goType(f.kind);
      const tag = goTagOk(wire) ? `json:${JSON.stringify(`${wire},omitempty`)}${t.tag}` : `json:"-"`;
      out.push(`\t${names[wire]!.padEnd(w)} ${t.type} \`${tag}\``);
    }
    out.push("}", "");
  } else {
    notes.push(`Your struct needs json tags equal to the rule wire names: ${[...fields.keys()].join(", ")}. Compare types are inferred from your field types (a string field with format:"date" is a date); a mismatch fails in MustBuild at startup.`);
  }
  out.push(`// ${varName} is built once at startup: an unknown field, bad compare type or id collision panics here.`, `var ${varName} = validonce.MustBuild[${model}](`);
  for (const l of lines) out.push(`\t${l}`);
  out.push(")", "");
  notes.push(
    `Huma: add \`func (${model}) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema { return humaonce.Transform(${varName}, s) }\` to publish x-validonce, and register the handler as huma.Register(api, op, humaonce.Wrap(${varName}, handler)) (import github.com/metatoy/validonce/go/humaonce).`,
    `go-playground/validator: keep field tags on the struct and call ${varName}.Check(v) after validate.Struct(v); it returns the failing rules as issues.`,
  );
  const source = out.join("\n");
  return { target: "go", language: "go", source, files: [{ path: `${lowerFirst(model)}.go`, language: "go", source }], complete: unexpressible.length === 0, unexpressible, notes, names };
}

// ---------------------------------------------------------------- Java

const JAVA_KEYWORDS = new Set(
  "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record yield sealed permits".split(" "),
);

function javaType(k: Kind): string {
  switch (k) {
    case "number": return "Double";
    case "integer": return "Long";
    case "bool": return "Boolean";
    case "date": return "LocalDate";
    case "datetime": return "OffsetDateTime";
    default: return "String";
  }
}

function genJava(set: RuleSet, input: CodegenInput, fields: Map<string, FieldInfo>, model: string): CodegenResult {
  const notes: string[] = [];
  const naming = input.naming ?? "auto";
  const toName = (w: string) => ident(naming === "pascal" ? pascalOf(w) : naming === "snake" ? snakeOf(w) : naming === "identity" ? w : camelOf(w), JAVA_KEYWORDS, "field");
  const names = uniqueNames([...fields.keys()], input.propertyNames, toName, new Set());
  const wantModel = input.includeModel ?? true;
  const pkg = input.namespace;
  const jq = (s: string) => JSON.stringify(s);
  const jnum = (n: number) => (Number.isInteger(n) && Math.abs(n) < 2 ** 31 ? String(n) : /[eE]/.test(String(n)) || !Number.isInteger(n) ? String(n) : `${String(n)}.0`);
  const jval = (v: unknown): string => (v === null ? "null" : typeof v === "number" ? jnum(v) : typeof v === "boolean" ? String(v) : jq(String(v)));
  const cond = (c: Condition): string => {
    if ("eq" in c) return `Condition.eq(${jq(c.eq.field)}, ${jval(c.eq.value)})`;
    if ("ne" in c) return `Condition.ne(${jq(c.ne.field)}, ${jval(c.ne.value)})`;
    if ("in" in c) return `Condition.in(${[jq(c.in.field), ...c.in.values.map(jval)].join(", ")})`;
    if ("present" in c) return `Condition.present(${jq(c.present.field)})`;
    if ("absent" in c) return `Condition.absent(${jq(c.absent.field)})`;
    if ("all" in c) return `Condition.all(${c.all.map(cond).join(", ")})`;
    if ("any" in c) return `Condition.any(${c.any.map(cond).join(", ")})`;
    return `Condition.not(${cond(c.not)})`;
  };
  const inferredType = (k: Kind) => (k === "integer" || k === "number" ? "number" : k === "string" ? "string" : k === "date" ? "date" : k === "datetime" ? "datetime" : "");
  const tail = (r: Rule, first: string, extra = ""): string => {
    let s = `.key(${jq(r.message.key)})`;
    for (const [k, v] of Object.entries(r.message.params ?? {})) s += `.param(${jq(k)}, ${jval(v)})`;
    if (r.id !== defaultId(model, r, first)) s += `.id(${jq(r.id)})`;
    if (r.path !== undefined) s += `.path(${jq(r.path)})`;
    if (r.server_only) s += ".serverOnly()";
    return s + extra;
  };
  const rl: string[] = [];
  for (const r of set.rules) {
    const first = firstField(r);
    if (r.kind === "required_when") rl.push(`.requiredWhen(${jq(r.field)}, ${cond(r.when)})${tail(r, first)}`);
    else if (r.kind === "compare") {
      const sides = [r.left.field, ...("field" in r.right ? [r.right.field] : [])];
      const needType = sides.some((w) => inferredType(fields.get(w)!.kind) !== r.type);
      const typ = needType ? `.type(CompareType.${r.type.toUpperCase()})` : "";
      const call = "field" in r.right ? `.compare(${jq(r.left.field)}, Op.${r.op.toUpperCase()}, ${jq(r.right.field)})` : `.compareValue(${jq(r.left.field)}, Op.${r.op.toUpperCase()}, ${jval((r.right as { value: unknown }).value)})`;
      rl.push(`${call}${tail(r, first, typ)}`);
    } else {
      const m = { at_least_one_of: "atLeastOneOf", exactly_one_of: "exactlyOneOf", all_or_none: "allOrNone" }[r.kind];
      rl.push(`.${m}(${r.fields.map(jq).join(", ")})${tail(r, first)}`);
    }
  }
  const header = (imports: string[]) => [...(pkg ? [`package ${pkg};`, ""] : []), ...imports.map((i) => `import ${i};`), ""];
  const files: GeneratedFile[] = [];
  if (wantModel) {
    const kinds = new Set([...fields.values()].map((f) => f.kind));
    const imps = ["com.fasterxml.jackson.annotation.JsonProperty"];
    if (kinds.has("date")) imps.push("java.time.LocalDate");
    if (kinds.has("datetime")) imps.push("java.time.OffsetDateTime");
    imps.push("com.metatoy.validonce.spring.ValidonceRules");
    imps.sort();
    const o = [...header(imps), `/** The wire model. Jackson property names are the rule field names. */`, `@ValidonceRules(${model}Rules.class)`, `public record ${model}(`];
    const comps = [...fields].map(([w, f]) => `        ${names[w] !== w ? `@JsonProperty(${jq(w)}) ` : ""}${javaType(f.kind)} ${names[w]}`);
    o.push(comps.join(",\n") + ") {}", "");
    files.push({ path: `${model}.java`, language: "java", source: o.join("\n") });
  } else {
    notes.push(`Your model needs Jackson property names equal to the rule wire names: ${[...fields.keys()].join(", ")}. Compare types are inferred from the Java types (a String is a string; add .type(CompareType.DATE) for dates held in a String).`);
  }
  const ro = [...header(["com.metatoy.validonce.CompareType", "com.metatoy.validonce.Condition", "com.metatoy.validonce.Op", "com.metatoy.validonce.RuleDefinition", "com.metatoy.validonce.RuleSetBuilder"]),
    `/** Built once, on first use: an unknown property, bad compare type or id collision throws ValidonceDefinitionException. */`,
    `public final class ${model}Rules extends RuleDefinition<${model}> {`,
    `    public ${model}Rules() {`, `        super(${model}.class);`, "    }", "",
    "    @Override", `    protected void define(RuleSetBuilder<${model}> r) {`, "        r"];
  for (const l of rl) ro.push(`                ${l}`);
  ro[ro.length - 1] += ";";
  ro.push("    }", "}", "");
  files.push({ path: `${model}Rules.java`, language: "java", source: ro.join("\n") });
  notes.push(
    "Spring Boot: add com.metatoy:validonce-spring; @ValidonceRules runs the rules in the normal @Valid flow and a 422 problem-details handler is registered by auto-configuration.",
    "Kotlin: use the same classes. A data class needs @get:JsonProperty(...) (or the jackson-module-kotlin naming) where the property name differs from the wire name, and `@ValidonceRules(XRules::class)`; RuleDefinition subclasses are written in Kotlin as `class XRules : RuleDefinition<X>(X::class.java) { override fun define(rules: RuleSetBuilder<X>) { rules.atLeastOneOf(...).key(...) } }`.",
    "Numbers in conditions and params are written as Java literals; the library stores them as doubles, as the rule format does.",
  );
  return { target: "java", language: "java", source: files.map((f) => `// ----- ${f.path} -----\n${f.source}`).join("\n"), files, complete: true, unexpressible: [], notes, names };
}

// ---------------------------------------------------------------- TypeScript rules builders (Fastify, NestJS), Vue, DOM

function tsBuilders(set: RuleSet, model: string, fieldList: string[], varName = "rules"): { code: string; imports: string[] } {
  const used = new Set<string>(["defineRules", "fieldRefs"]);
  const ref = (w: string) => (isIdent(w) ? `F.${w}` : `F[${q(w)}]`);
  const cond = (c: Condition): string => {
    if ("eq" in c) return `${ref(c.eq.field)}.eq(${JSON.stringify(c.eq.value)})`;
    if ("ne" in c) return `${ref(c.ne.field)}.ne(${JSON.stringify(c.ne.value)})`;
    if ("in" in c) return `${ref(c.in.field)}.isIn(${JSON.stringify(c.in.values)})`;
    if ("present" in c) return `${ref(c.present.field)}.present()`;
    if ("absent" in c) return `${ref(c.absent.field)}.absent()`;
    if ("all" in c) { used.add("allOf"); return `allOf(${c.all.map(cond).join(", ")})`; }
    if ("any" in c) { used.add("anyOf"); return `anyOf(${c.any.map(cond).join(", ")})`; }
    used.add("not");
    return `not(${cond(c.not)})`;
  };
  const opts = (r: Rule, extra = ""): string => {
    const parts = [`key: ${q(r.message.key)}`];
    if (r.message.params !== undefined) parts.push(`params: ${JSON.stringify(r.message.params)}`);
    const path = r.path ?? firstField(r);
    if (r.id !== defaultId(model, r, path)) parts.push(`id: ${q(r.id)}`);
    if (r.path !== undefined) parts.push(`path: ${q(r.path)}`);
    if (r.server_only) parts.push("server_only: true");
    if (extra) parts.push(extra);
    return `{ ${parts.join(", ")} }`;
  };
  const CMP: Record<string, string> = { lt: "lt", le: "le", gt: "gt", ge: "ge", eq: "equals", ne: "notEquals" };
  const lines = set.rules.map((r) => {
    if (r.kind === "required_when") { used.add("when"); return `when(${cond(r.when)}).require(${ref(r.field)}, ${opts(r)}),`; }
    if (r.kind === "compare") {
      const right = "field" in r.right ? ref(r.right.field) : JSON.stringify(r.right.value);
      return `${ref(r.left.field)}.${CMP[r.op]}(${right}, ${opts(r, `type: ${q(r.type)}`)}),`;
    }
    const fn = { at_least_one_of: "atLeastOneOf", exactly_one_of: "exactlyOneOf", all_or_none: "allOrNone" }[r.kind];
    used.add(fn);
    return `${fn}(${[...r.fields.map(ref), opts(r)].join(", ")}),`;
  });
  const code = [
    `const fields = ${JSON.stringify(fieldList)} as const;`,
    "const F = fieldRefs(...fields);",
    "",
    "// Built once at startup: an unknown field or an id collision stops the app here.",
    `export const ${varName} = defineRules(`,
    `  ${q(model)},`,
    "  [",
    ...lines.map((l) => `    ${l}`),
    "  ],",
    "  { fields },",
    ");",
  ].join("\n");
  return { code, imports: [...used].sort() };
}

function tsFieldType(f: FieldInfo): { box: string; ts: string; validator: string[] } {
  switch (f.kind) {
    case "number": return { box: "Type.Number()", ts: "number", validator: ["@IsNumber()"] };
    case "integer": return { box: "Type.Integer()", ts: "number", validator: ["@IsInt()"] };
    case "bool": return { box: "Type.Boolean()", ts: "boolean", validator: ["@IsBoolean()"] };
    case "date": return { box: 'Type.String({ format: "date" })', ts: "string", validator: ["@Matches(/^\\d{4}-\\d{2}-\\d{2}$/)"] };
    case "datetime": return { box: 'Type.String({ format: "date-time" })', ts: "string", validator: ["@IsISO8601()"] };
    default: return { box: "Type.String()", ts: "string", validator: ["@IsString()"] };
  }
}

function tsNamesOf(fields: Map<string, FieldInfo>): Record<string, string> {
  return Object.fromEntries([...fields.keys()].map((w) => [w, w]));
}

function genTsRules(set: RuleSet, input: CodegenInput, fields: Map<string, FieldInfo>, model: string): CodegenResult {
  const framework = input.framework ?? "fastify";
  const wantModel = input.includeModel ?? true;
  const { code, imports } = tsBuilders(set, model, [...fields.keys()]);
  const notes: string[] = [];
  const prop = (w: string) => (isIdent(w) ? w : q(w));
  const out: string[] = [];
  if (framework === "fastify") {
    if (wantModel) out.push(`import { Type } from "@sinclair/typebox";`);
    out.push(`import { ${imports.join(", ")} } from "validonce/rules";`);
    if (wantModel) out.push(`import { withRules } from "validonce/fastify";`);
    out.push("", code, "");
    if (wantModel) {
      out.push("// Skeleton: tighten the field checks (required, formats, bounds) to match your API.", `export const ${model}Schema = withRules(`, "  Type.Object(", "    {");
      for (const [w, f] of fields) out.push(`      ${prop(w)}: Type.Optional(Type.Union([${tsFieldType(f).box}, Type.Null()])),`);
      out.push("    },", `    { $id: ${q(model)} },`, "  ),", "  rules,", ");", "");
    } else notes.push("Attach with withRules(yourTypeBoxSchema, rules) from validonce/fastify.");
    notes.push(
      "Fastify: create the app with Fastify({ ajv: { customOptions: { keywords: ajvKeywords } } }), register the schema with app.addSchema, and add validonceHook(rules) as a preHandler on the route (imports from validonce/fastify); it replies 422 problem details.",
      "withRules also puts x-validonce on the schema, so @fastify/swagger publishes the rules under components.schemas.",
    );
  } else {
    const vals = new Set<string>();
    if (wantModel) for (const f of fields.values()) for (const v of tsFieldType(f).validator) vals.add(v.slice(1, v.indexOf("(")));
    if (wantModel) out.push(`import { ${["IsOptional", ...vals].sort().join(", ")} } from "class-validator";`);
    out.push(`import { ${imports.join(", ")} } from "validonce/rules";`);
    if (wantModel) out.push(`import { ValidonceRules } from "validonce/nestjs";`);
    out.push("", code, "");
    if (wantModel) {
      out.push("// Field checks (class-validator) answer 400; the rules answer 422. Tighten them to match your API.", "@ValidonceRules(rules)", `export class ${model} {`);
      for (const [w, f] of fields) {
        const t = tsFieldType(f);
        out.push(`  @IsOptional()`, ...t.validator.map((v) => `  ${v}`), `  ${prop(w)}?: ${t.ts} | null;`, "");
      }
      out.pop();
      out.push("}", "");
    } else notes.push("Decorate your DTO class with @ValidonceRules(rules) from validonce/nestjs.");
    notes.push(
      `NestJS: run ValidonceValidationPipe (validonce/nestjs) after Nest's ValidationPipe: @Body(new ValidonceValidationPipe(${model})) body: ${model}; add ValidonceExceptionFilter for the 422 problem details, and addValidonceToDocument(document, ...) to publish x-validonce in Swagger.`,
      "esbuild/Vite emit no decorator metadata, so @nestjs/swagger needs an explicit @ApiProperty({ type: ... }) on each property.",
    );
  }
  const source = out.join("\n");
  return {
    target: "typescript-rules", language: "typescript", source,
    files: [{ path: `${lowerFirst(model)}.rules.ts`, language: "typescript", source }],
    complete: true, unexpressible: [], notes, names: tsNamesOf(fields),
  };
}

function varNames(fields: Map<string, FieldInfo>, taken: string[]): Record<string, string> {
  return uniqueNames([...fields.keys()], undefined, (w) => ident(camelOf(w), PY_KEYWORDS, "field"), new Set(taken));
}

function genVue(set: RuleSet, input: CodegenInput, fields: Map<string, FieldInfo>, model: string): CodegenResult {
  const wantModel = input.includeModel ?? false;
  const cm = camelOf(model) || "model";
  const reserved = ["form", "errors", "onSubmit", "rules", "messages", "schema"];
  const vars = varNames(fields, reserved);
  const names = input.propertyNames ? { ...vars, ...input.propertyNames } : vars;
  const notes: string[] = [];
  const base = `${cm}Base`;
  const out: string[] = [
    `import { useForm } from "vee-validate";`,
    `import type { RuleSet } from "validonce";`,
    `import type { Catalog } from "validonce/messages";`,
    `import { toVeeSchema, watchDependents } from "validonce/vue";`,
    `import { ${[...(wantModel ? [...new Set([...fields.values()].flatMap((f) => (f.kind === "date" ? ["isoDate"] : f.kind === "datetime" ? ["isoDateTime"] : [])))].sort() : []), "withRules"].join(", ")} } from "validonce/zod";`,
    `import { z } from "zod";`,
    "",
    `export const rules: RuleSet = ${tsRules({ version: 1, rules: set.rules })};`,
    "",
    `export const messages: Catalog = ${messageCatalog(set)};`,
    "",
  ];
  if (wantModel) {
    out.push("// Skeleton: replace with your real schema (field-level checks stay there).", `const ${base} = z.object({`);
    for (const [w, f] of fields) out.push(`  ${isIdent(w) ? w : q(w)}: ${zodField(f)},`);
    out.push("});", "");
  } else notes.push(`\`${base}\` is your existing z.object(...) schema; every field named by a rule must exist in it or withRules throws.`);
  out.push(
    `export type ${model}Values = z.input<typeof ${base}>;`,
    `export const schema = withRules(${base}, rules, { messages });`,
    "",
    `export function use${model}Form(onValid: (values: ${model}Values) => void | Promise<void> = () => {}) {`,
    `  const form = useForm<${model}Values>({ validationSchema: toVeeSchema(schema) });`,
    "  // Changing one field re-checks the fields whose rules read it.",
    "  watchDependents(form, rules);",
  );
  for (const w of fields.keys()) out.push(`  const [${names[w]}] = form.defineField(${q(w)} as never);`);
  out.push(
    "  const onSubmit = form.handleSubmit((values) => onValid(values));",
    `  return { form, errors: form.errors, onSubmit, ${[...fields.keys()].map((w) => names[w]).join(", ")} };`,
    "}",
    "",
  );
  const comp = out.join("\n");
  const tpl: string[] = ["<template>", '  <form novalidate @submit="onSubmit">'];
  for (const [w, f] of fields) {
    const v = names[w]!;
    const err = isIdent(w) ? `errors.${w}` : `errors['${w.replace(/[\\']/g, "\\$&").replace(/"/g, "&quot;")}']`;
    const type = f.kind === "date" ? "date" : f.kind === "bool" ? "checkbox" : f.kind === "number" || f.kind === "integer" ? "number" : "text";
    const model2 = f.kind === "number" || f.kind === "integer" ? `v-model.number="${v}"` : `v-model="${v}"`;
    tpl.push("    <label>", `      ${ht(w)}`, `      <input type="${type}" name=${hq(w)} ${model2} :aria-invalid="${err} ? true : undefined" aria-describedby="error-${w.replace(/[^A-Za-z0-9_-]/g, "_")}" />`, "    </label>", `    <p id="error-${w.replace(/[^A-Za-z0-9_-]/g, "_")}" class="error" role="alert">{{ ${err} }}</p>`);
  }
  tpl.push('    <button type="submit">Submit</button>', "  </form>", "</template>");
  const vue = [
    '<script setup lang="ts">',
    `import { use${model}Form, type ${model}Values } from "./use${model}Form";`,
    `const emit = defineEmits<{ submit: [values: ${model}Values] }>();`,
    `const { errors, onSubmit, ${[...fields.keys()].map((w) => names[w]).join(", ")} } = use${model}Form((values) => emit("submit", values));`,
    "</script>",
    "",
    ...tpl,
    "",
  ].join("\n");
  notes.push(
    "vee-validate 4: toVeeSchema adapts the Zod 4 schema (vee-validate 5 takes Standard Schema directly). Blank inputs arrive as empty strings, which the rules treat as blank; map them to null if your Zod base schema needs it.",
    "server_only rules are skipped by withRules; they still run on the server.",
  );
  return {
    target: "vue", language: "typescript", source: comp,
    files: [
      { path: `use${model}Form.ts`, language: "typescript", source: comp },
      { path: `${model}Form.vue`, language: "vue", source: vue },
    ],
    complete: true, unexpressible: [], notes, names,
  };
}

function genDom(set: RuleSet, input: CodegenInput, fields: Map<string, FieldInfo>, model: string): CodegenResult {
  const id = (camelOf(model) || "model").replace(/[^A-Za-z0-9_-]/g, "");
  const notes: string[] = [];
  const out = [
    `import { attachRules } from "validonce/dom";`,
    `import type { RuleSet } from "validonce";`,
    `import type { Catalog } from "validonce/messages";`,
    "",
    `export const rules: RuleSet = ${tsRules({ version: 1, rules: set.rules })};`,
    "",
    `export const messages: Catalog = ${messageCatalog(set)};`,
    "",
    "/** Checks run on change and on submit; a failing submit is blocked and the messages are shown. */",
    `export function attach${model}Form(form: HTMLFormElement) {`,
    "  return attachRules(form, rules, { messages });",
    "}",
    "",
    'if (typeof document !== "undefined") {',
    `  const form = document.querySelector<HTMLFormElement>("#${id}");`,
    `  if (form) attach${model}Form(form);`,
    "}",
    "",
  ].join("\n");
  const html: string[] = [`<form id="${id}" novalidate>`];
  for (const [w, f] of fields) {
    const type = f.kind === "date" ? "date" : f.kind === "bool" ? "checkbox" : f.kind === "number" || f.kind === "integer" ? "number" : "text";
    html.push(`  <label>${ht(w)} <input type="${type}" name=${hq(w)} /></label>`, `  <p data-validonce-error=${hq(w)} hidden></p>`);
  }
  html.push('  <button type="submit">Submit</button>', "</form>", "");
  notes.push(
    "Each input's name is the rule wire name; the <p data-validonce-error> element is where its message goes (attachRules creates one after the label when it is missing). Form-associated custom elements must expose ElementInternals as `internals`.",
    "Dependent fields (a rule that reads another field) are re-checked when that field changes. server_only rules are skipped; show server 422s with attached.applyServerErrors(body).",
  );
  return {
    target: "dom", language: "typescript", source: out,
    files: [
      { path: `${id}-form.ts`, language: "typescript", source: out },
      { path: `${id}-form.html`, language: "html", source: html.join("\n") },
    ],
    complete: true, unexpressible: [], notes, names: tsNamesOf(fields),
  };
}
