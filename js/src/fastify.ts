// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { FastifyReply, FastifyRequest } from "fastify";
import { evaluate } from "./evaluate";
import { parseRuleSet } from "./parse";
import { PROBLEM_CONTENT_TYPE, problemDetails } from "./problem";
import type { RuleSet } from "./types";

export { type ProblemDetails, problemDetails } from "./problem";

/**
 * Tell Fastify's Ajv about the `x-validonce` keyword, or schema compilation fails in strict mode:
 * `Fastify({ ajv: { customOptions: { keywords: ajvKeywords } } })`.
 */
export const ajvKeywords: string[] = ["x-validonce"];

/**
 * `@fastify/swagger` option that names each shared schema's component by its `$id` (it would
 * otherwise call it `def-0`): `app.register(swagger, { openapi, refResolver: swaggerRefResolver })`.
 */
export const swaggerRefResolver = {
  buildLocalReference(
    json: { $id?: unknown; title?: unknown },
    _baseUri: unknown,
    _fragment: unknown,
    i: number,
  ): string {
    if (typeof json.$id === "string" && json.$id !== "") return json.$id;
    if (typeof json.title === "string" && json.title !== "") return json.title;
    return `def-${i}`;
  },
};

/**
 * Attach rules to a TypeBox (or any JSON Schema) object schema. Give the schema an `$id` and
 * register it with `app.addSchema`, so `@fastify/swagger` emits it under `components.schemas`
 * with `x-validonce`.
 */
export function withRules<T extends object>(
  schema: T,
  rules: RuleSet,
): T & { "x-validonce": RuleSet } {
  return { ...schema, "x-validonce": parseRuleSet(rules) };
}

/** The rules attached by `withRules`, or undefined. */
export function rulesOf(schema: unknown): RuleSet | undefined {
  if (typeof schema !== "object" || schema === null) return undefined;
  const raw = (schema as Record<string, unknown>)["x-validonce"];
  return raw === undefined ? undefined : parseRuleSet(raw);
}

/**
 * A `preHandler` that evaluates every rule (server side) against the parsed body and replies 422
 * problem details with a top-level `validonce` member. It runs after Fastify's schema validation,
 * so rules only see bodies whose fields already passed.
 */
export function validonceHook(rules: RuleSet | object) {
  const set = "version" in rules ? parseRuleSet(rules) : rulesOf(rules);
  if (!set)
    throw new TypeError(
      "validonceHook: pass a RuleSet, or a schema built with withRules()",
    );
  return async function validonce(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const body = request.body;
    if (typeof body !== "object" || body === null || Array.isArray(body))
      return;
    const issues = evaluate(set.rules, body as Record<string, unknown>);
    if (issues.length === 0) return;
    return reply
      .code(422)
      .type(PROBLEM_CONTENT_TYPE)
      .send(problemDetails(issues));
  };
}
