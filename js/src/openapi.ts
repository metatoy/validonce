// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { parseRuleSet } from "./parse";
import { type RuleSet, ValidonceFormatError } from "./types";

function schemasOf(document: unknown): Record<string, unknown> {
  const components =
    typeof document === "object" && document !== null
      ? (document as { components?: unknown }).components
      : undefined;
  const schemas =
    typeof components === "object" && components !== null
      ? (components as { schemas?: unknown }).schemas
      : undefined;
  if (typeof schemas !== "object" || schemas === null || Array.isArray(schemas))
    return {};
  return schemas as Record<string, unknown>;
}

function ruleSetOf(schema: unknown, name: string): RuleSet | undefined {
  if (typeof schema !== "object" || schema === null) return undefined;
  const raw = (schema as Record<string, unknown>)["x-validonce"];
  if (raw === undefined) return undefined;
  try {
    return parseRuleSet(raw);
  } catch (e) {
    if (e instanceof ValidonceFormatError)
      throw new ValidonceFormatError(`${name}: ${e.message}`);
    throw e;
  }
}

/**
 * The RuleSet in `components.schemas[schemaName]["x-validonce"]`, or undefined.
 * When the exact name is missing, `${schemaName}-Input` is tried: FastAPI splits a model used
 * for both requests and responses into `Name-Input` and `Name-Output`, and only the input
 * schema carries the rules.
 */
export function rulesFromOpenApi(
  document: unknown,
  schemaName: string,
): RuleSet | undefined {
  const schemas = schemasOf(document);
  for (const name of [schemaName, `${schemaName}-Input`]) {
    if (Object.hasOwn(schemas, name)) return ruleSetOf(schemas[name], name);
  }
  return undefined;
}

/** Every schema's RuleSet, keyed by schema name. Schemas without rules are omitted. */
export function allRulesFromOpenApi(
  document: unknown,
): Record<string, RuleSet> {
  const out: Record<string, RuleSet> = {};
  for (const [name, schema] of Object.entries(schemasOf(document))) {
    const rs = ruleSetOf(schema, name);
    if (rs) out[name] = rs;
  }
  return out;
}
