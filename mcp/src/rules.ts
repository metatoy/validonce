// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { readFile, stat } from "node:fs/promises";
import {
  type Condition,
  type Issue,
  type Rule,
  type RuleSet,
  ValidonceFormatError,
  evaluate,
  parseRuleSet,
} from "validonce";
import { allRulesFromOpenApi, rulesFromOpenApi } from "validonce/openapi";
import { resolveInsideRoots } from "./roots";
import { ToolError } from "./sdk";

export const MAX_FILE_BYTES = 5_000_000;
export const MAX_PAYLOADS = 200;

export async function loadDocument(
  path: string,
  roots: string[],
): Promise<unknown> {
  const real = await resolveInsideRoots(path, roots);
  let size: number;
  try {
    size = (await stat(real)).size;
  } catch {
    throw new ToolError("File not found.");
  }
  if (size > MAX_FILE_BYTES)
    throw new ToolError(`File is larger than ${MAX_FILE_BYTES} bytes.`);
  try {
    return JSON.parse(await readFile(real, "utf8"));
  } catch {
    throw new ToolError("File is not valid JSON.");
  }
}

export interface SchemaRules {
  schema: string;
  ruleCount: number;
  rules: Rule[];
}

export function readRules(document: unknown): {
  schemasWithRules: SchemaRules[];
  schemasWithoutRules: string[];
  errors: string[];
} {
  const errors: string[] = [];
  let all: Record<string, RuleSet> = {};
  try {
    all = allRulesFromOpenApi(document);
  } catch (e) {
    errors.push(e instanceof ValidonceFormatError ? e.message : "unreadable");
  }
  const schemas = schemaNames(document);
  return {
    schemasWithRules: Object.entries(all).map(([schema, rs]) => ({
      schema,
      ruleCount: rs.rules.length,
      rules: rs.rules,
    })),
    schemasWithoutRules: schemas.filter((s) => !(s in all)),
    errors,
  };
}

export function schemaNames(document: unknown): string[] {
  const c = (document as { components?: { schemas?: unknown } } | null)
    ?.components?.schemas;
  return typeof c === "object" && c !== null && !Array.isArray(c)
    ? Object.keys(c)
    : [];
}

export interface Problem {
  severity: "error" | "warning";
  code: string;
  ruleId?: string;
  message: string;
}

type Props = Record<string, unknown>;

function conditionFields(c: Condition, out: string[]): void {
  if ("eq" in c) out.push(c.eq.field);
  else if ("ne" in c) out.push(c.ne.field);
  else if ("in" in c) out.push(c.in.field);
  else if ("present" in c) out.push(c.present.field);
  else if ("absent" in c) out.push(c.absent.field);
  else if ("all" in c) for (const x of c.all) conditionFields(x, out);
  else if ("any" in c) for (const x of c.any) conditionFields(x, out);
  else if ("not" in c) conditionFields(c.not, out);
}

export function fieldsOf(rule: Rule): string[] {
  const out: string[] = [];
  if (rule.kind === "required_when") {
    out.push(rule.field);
    conditionFields(rule.when, out);
  } else if (rule.kind === "compare") {
    out.push(rule.left.field);
    if ("field" in rule.right) out.push(rule.right.field);
  } else out.push(...rule.fields);
  return out;
}

function typesOf(prop: unknown): { types: string[]; format?: string } {
  const p = (prop ?? {}) as { type?: unknown; format?: unknown };
  const t = Array.isArray(p.type) ? p.type : p.type === undefined ? [] : [p.type];
  return {
    types: t.filter((x): x is string => typeof x === "string"),
    format: typeof p.format === "string" ? p.format : undefined,
  };
}

function compatible(compareType: string, prop: unknown): boolean {
  const { types, format } = typesOf(prop);
  if (types.length === 0) return true; // unconstrained: cannot tell
  if (compareType === "number")
    return types.includes("integer") || types.includes("number");
  if (!types.includes("string")) return false;
  if (compareType === "date") return format === undefined || format === "date";
  if (compareType === "datetime")
    return format === undefined || format === "date-time";
  return true;
}

/** Resolve the `properties` object to check field names against. */
export function propertiesFor(
  document: unknown,
  schemaName: string | undefined,
  properties: Props | undefined,
): Props | undefined {
  if (properties) return properties;
  if (document === undefined || schemaName === undefined) return undefined;
  const schemas =
    (document as { components?: { schemas?: Record<string, unknown> } })
      ?.components?.schemas ?? {};
  for (const n of [schemaName, `${schemaName}-Input`]) {
    const s = Object.hasOwn(schemas, n) ? schemas[n] : undefined;
    const p = (s as { properties?: unknown } | undefined)?.properties;
    if (typeof p === "object" && p !== null) return p as Props;
  }
  throw new ToolError(`Schema "${schemaName}" has no properties in the document.`);
}

/** The `required` list of the same schema, when it comes from a document. */
export function requiredFor(
  document: unknown,
  schemaName: string | undefined,
  required: string[] | undefined,
): string[] | undefined {
  if (required) return required;
  if (document === undefined || schemaName === undefined) return undefined;
  const schemas =
    (document as { components?: { schemas?: Record<string, unknown> } })
      ?.components?.schemas ?? {};
  for (const n of [schemaName, `${schemaName}-Input`]) {
    const s = Object.hasOwn(schemas, n) ? schemas[n] : undefined;
    const r = (s as { required?: unknown } | undefined)?.required;
    if (Array.isArray(r)) return r.filter((x): x is string => typeof x === "string");
  }
  return undefined;
}

export function checkRules(rules: unknown, properties: Props | undefined) {
  const problems: Problem[] = [];
  let set: RuleSet;
  try {
    set = parseRuleSet(rules);
  } catch (e) {
    problems.push({
      severity: "error",
      code: "invalid_rule_set",
      message: e instanceof ValidonceFormatError ? e.message : "Invalid rule set.",
    });
    return { ok: false, ruleCount: 0, fieldsChecked: false, problems };
  }
  const seen = new Set<string>();
  for (const r of set.rules) {
    if (seen.has(r.id))
      problems.push({
        severity: "error",
        code: "duplicate_id",
        ruleId: r.id,
        message: `Rule id "${r.id}" is used more than once.`,
      });
    seen.add(r.id);
    if (!properties) continue;
    for (const f of new Set(fieldsOf(r))) {
      if (!Object.hasOwn(properties, f))
        problems.push({
          severity: "error",
          code: "unknown_field",
          ruleId: r.id,
          message: `Field "${f}" is not a property of the schema.`,
        });
    }
    if (r.kind === "compare") {
      const sides = [r.left.field];
      if ("field" in r.right) sides.push(r.right.field);
      for (const f of sides) {
        if (Object.hasOwn(properties, f) && !compatible(r.type, properties[f]))
          problems.push({
            severity: "error",
            code: "type_mismatch",
            ruleId: r.id,
            message: `compare type "${r.type}" does not match the JSON Schema type of "${f}".`,
          });
      }
    }
  }
  return {
    ok: !problems.some((p) => p.severity === "error"),
    ruleCount: set.rules.length,
    fieldsChecked: properties !== undefined,
    problems,
  };
}

export function evaluatePayloads(
  rules: unknown,
  payloads: Record<string, unknown>[],
  side: "server" | "client",
) {
  let set: RuleSet;
  try {
    set = parseRuleSet(rules);
  } catch (e) {
    throw new ToolError(
      `Invalid rule set: ${e instanceof ValidonceFormatError ? e.message : "unreadable"}`,
    );
  }
  return payloads.map((payload, index) => {
    const issues: Issue[] = evaluate(set.rules, payload, { side });
    return { index, valid: issues.length === 0, issues };
  });
}

export { rulesFromOpenApi };
