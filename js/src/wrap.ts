// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { ruleFields } from "./fields";
import type { RuleSet } from "./types";

export type WrapStyle = "auto" | "orval" | "kubb";

export interface WrapInput {
  /** The parsed OpenAPI document (for each schema's `properties`). */
  doc: unknown;
  /** Rules by schema name, as `collect()` in cli.ts reports them (`Name-Input` is `Name`). */
  rules: Record<string, RuleSet>;
  /** Source text of the generated Zod module. */
  zodSource: string;
  /** Import specifier of the Zod module as written in the companion (`./schemas`). */
  zodImport: string;
  style: WrapStyle;
  /** `--map Name=exportName` */
  map: Record<string, string>;
  /** Label for the OpenAPI document in the header comment. */
  openapiLabel: string;
}

export interface WrapResult {
  /** The companion module; undefined when `errors` is not empty. */
  text?: string;
  errors: string[];
  warnings: string[];
}

/** Line-anchored on purpose: no TypeScript compiler dependency. Proven on orval and kubb output. */
const EXPORT_RE = /^export const (\w+)\s*(?::[^=]+)?=/gm;
const ALIAS_RE = /^export const (\w+)\s*(?::[^=]+)?=\s*(\w+)\s*;?\s*$/gm;

function words(name: string): string[] {
  return name.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

/** `Signup-Input` -> `SignupInput`; `my_thing` -> `MyThing`. */
export function pascal(name: string): string {
  return words(name)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/** `Signup-Input` -> `signupInput`. */
export function camel(name: string): string {
  const p = pascal(name);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function schemasOf(doc: unknown): Record<string, unknown> {
  const c = isRecord(doc) ? doc.components : undefined;
  const s = isRecord(c) ? c.schemas : undefined;
  return isRecord(s) ? s : {};
}

function hasRef(node: unknown, target: string): boolean {
  if (Array.isArray(node)) return node.some((n) => hasRef(n, target));
  if (!isRecord(node)) return false;
  for (const [k, v] of Object.entries(node)) {
    if (k === "$ref" && v === `#/components/schemas/${target}`) return true;
    if (k !== "x-validonce" && hasRef(v, target)) return true;
  }
  return false;
}

/** The OpenAPI key the rules came from: the plain name, else `Name-Input`. */
function sourceKey(schemas: Record<string, unknown>, name: string): string {
  for (const key of [name, `${name}-Input`]) {
    const s = schemas[key];
    if (isRecord(s) && s["x-validonce"] !== undefined) return key;
  }
  return name;
}

export function wrap(input: WrapInput): WrapResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const schemas = schemasOf(input.doc);

  const exported = new Set<string>();
  for (const m of input.zodSource.matchAll(EXPORT_RE))
    exported.add(m[1] as string);
  const aliases = new Map<string, string[]>(); // target export -> alias exports
  for (const m of input.zodSource.matchAll(ALIAS_RE)) {
    const list = aliases.get(m[2] as string) ?? [];
    list.push(m[1] as string);
    aliases.set(m[2] as string, list);
  }

  for (const k of Object.keys(input.map)) {
    if (!Object.hasOwn(input.rules, k))
      errors.push(
        `--map ${k}=${input.map[k]}: no schema "${k}" with x-validonce in ${input.openapiLabel} (schemas with rules: ${Object.keys(input.rules).sort().join(", ")})`,
      );
  }

  const lines: string[] = [];
  const used = new Set<string>();
  const wrapped: string[] = [];

  for (const name of Object.keys(input.rules).sort()) {
    const rs = input.rules[name] as RuleSet;
    const key = sourceKey(schemas, name);
    const schema = schemas[key];

    // Intersection and other non-object schemas: withRules needs a Zod object.
    const props = isRecord(schema) ? schema.properties : undefined;
    const composed =
      isRecord(schema) &&
      ["allOf", "oneOf", "anyOf"].some((k) => schema[k] !== undefined);
    if (composed || !isRecord(props)) {
      warnings.push(
        `skipping "${key}": it is not a plain object schema (allOf/oneOf/anyOf or no properties), and withRules needs a Zod object`,
      );
      continue;
    }

    // A rule naming a missing field would make withRules throw when the app loads.
    for (const rule of rs.rules) {
      for (const field of ruleFields(rule)) {
        if (!Object.hasOwn(props, field))
          errors.push(
            `rule "${rule.id}" refers to field "${field}", which is not in the properties of schema "${key}" in ${input.openapiLabel} (properties: ${Object.keys(props).join(", ")})`,
          );
      }
    }

    // Rules on a schema that other schemas embed are not enforced where it is embedded.
    const parents = Object.keys(schemas).filter(
      (other) => other !== key && hasRef(schemas[other], key),
    );
    if (parents.length > 0)
      warnings.push(
        `"${key}" has rules but is nested inside ${parents.join(", ")}; wrap attaches rules only to the top-level export, so the nested use is not checked (known limitation)`,
      );

    // Match the generated export.
    let target: string | undefined;
    const mapped = input.map[name];
    if (mapped !== undefined) {
      if (!exported.has(mapped))
        errors.push(
          `--map ${name}=${mapped}: ${input.zodImport} has no "export const ${mapped}"`,
        );
      else target = mapped;
    } else {
      const raws = [...new Set([name, key])];
      const found = new Set<string>();
      for (const raw of raws) {
        if (input.style !== "kubb" && exported.has(pascal(raw)))
          found.add(pascal(raw));
        if (input.style !== "orval" && exported.has(`${camel(raw)}Schema`))
          found.add(`${camel(raw)}Schema`);
      }
      const hint = [...(aliases.get(pascal(name)) ?? [])];
      if (found.size === 1) target = [...found][0];
      else if (found.size > 1)
        errors.push(
          `schema "${name}" matches more than one export in ${input.zodImport} (${[...found].sort().join(", ")}); pick one with --map ${name}=<export> or restrict --style`,
        );
      else {
        const tried = raws
          .flatMap((r) => [
            ...(input.style !== "kubb" ? [pascal(r)] : []),
            ...(input.style !== "orval" ? [`${camel(r)}Schema`] : []),
          ])
          .join(", ");
        errors.push(
          `schema "${name}" has rules but no matching export in ${input.zodImport} (looked for ${tried}, style ${input.style}); name it with --map ${name}=<export>${
            hint.length > 0
              ? `. Per-operation exports such as ${hint.join(", ")} match only through --map`
              : ""
          }`,
        );
      }
    }
    if (target === undefined) continue;
    if (used.has(target)) {
      errors.push(
        `export "${target}" is the match for more than one schema; use --map to separate them`,
      );
      continue;
    }
    used.add(target);
    wrapped.push(name);
    lines.push(
      `export const ${target} = _withRules(_gen.${target}, _rules[${JSON.stringify(name)}]);`,
    );
    const al = aliases.get(target) ?? [];
    if (al.length > 0)
      warnings.push(
        `${al.join(", ")} in ${input.zodImport} alias "${target}" and stay unwrapped; import "${target}" from the companion, or wrap them with --map`,
      );
  }

  if (wrapped.length === 0 && errors.length === 0)
    errors.push(
      `nothing to wrap: no schema with x-validonce in ${input.openapiLabel} could be matched`,
    );
  if (errors.length > 0) return { errors, warnings };

  const body: Record<string, RuleSet> = {};
  for (const n of wrapped) body[n] = input.rules[n] as RuleSet;
  const text = [
    "// SPDX-License-Identifier: Apache-2.0",
    "// Copyright 2026 Metatoy LLC",
    "",
    `// Generated by \`validonce wrap\` from ${input.openapiLabel}. Do not edit; re-run the command.`,
    'import type { RuleSet } from "validonce";',
    'import { withRules as _withRules } from "validonce/zod";',
    `import * as _gen from ${JSON.stringify(input.zodImport)};`,
    "",
    `const _rules = ${JSON.stringify(body, null, 2)} as const satisfies Record<string, RuleSet>;`,
    "",
    ...lines,
    "",
  ].join("\n");
  return { text, errors, warnings };
}
