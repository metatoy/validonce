// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { z } from "zod";
import { loadDocument, propertiesFor, readRules, requiredFor, checkRules, evaluatePayloads, MAX_PAYLOADS } from "./rules";
import { createHash } from "node:crypto";
import { NAMINGS, TARGETS, generateCode } from "./codegen";
import { compareResults } from "./compare";
import { loadJsonl, writeNewJsonl } from "./files";
import { DEFAULT_COUNT, MAX_COUNT, generateInputs } from "./generate";
import {
  ToolError,
  type ValidonceServer,
  createServer,
  defineReadOnlyTool,
  defineWritingTool,
  listClientRoots,
} from "./sdk";
import pkg from "../package.json" with { type: "json" };

// The package version, bundled in by esbuild, so the server never reports a stale one.
const SERVER_VERSION: string = pkg.version;

const obj = z.record(z.string(), z.unknown());

/** Largest JSONL string returned inline by generate_inputs; bigger sets go to `outFile`. */
const INLINE_JSONL_CHARS = 80_000;

export function buildServer(): ValidonceServer {
  const server = createServer("validonce-mcp", SERVER_VERSION);

  // Roots come from the client; without them, the directory the server was started in.
  const roots = async () => (await listClientRoots(server)) ?? [process.cwd()];

  defineReadOnlyTool(server, {
    name: "read_openapi_rules",
    title: "Read validonce rules from an OpenAPI document",
    description:
      "Lists the validonce rules (x-validonce) per schema in an OpenAPI document, and the schemas that have none. Pass either `path` (a JSON file inside the workspace roots) or `document` (the parsed object).",
    input: z.object({
      path: z.string().optional().describe("Path to an OpenAPI JSON file inside the roots"),
      document: obj.optional().describe("The OpenAPI document as an object"),
    }),
    handler: async ({ path, document }) => {
      if ((path === undefined) === (document === undefined))
        throw new ToolError("Pass exactly one of `path` or `document`.");
      const doc = path !== undefined ? await loadDocument(path, await roots()) : document;
      return readRules(doc);
    },
  });

  defineReadOnlyTool(server, {
    name: "check_rules",
    title: "Check a proposed validonce rule set",
    description:
      "Checks a rule set: format validity, duplicate ids, field names and compare types against a schema's properties. Give the schema either as `properties`, or as `document` + `schemaName`. Reports problems; never throws on bad rules.",
    input: z.object({
      rules: z.unknown().describe("The rule set object: { version: 1, rules: [...] }"),
      properties: obj.optional().describe("JSON Schema `properties` of the target schema"),
      document: obj.optional().describe("OpenAPI document to take the schema from"),
      schemaName: z.string().optional().describe("Schema name inside `document`"),
    }),
    handler: ({ rules, properties, document, schemaName }) =>
      checkRules(rules, propertiesFor(document, schemaName, properties)),
  });

  defineReadOnlyTool(server, {
    name: "evaluate",
    title: "Evaluate validonce rules on sample payloads",
    description:
      "Runs a rule set against sample payloads and returns the issues per payload. `side` is 'server' (default, all rules) or 'client' (skips server_only rules).",
    input: z.object({
      rules: z.unknown().describe("The rule set object: { version: 1, rules: [...] }"),
      payloads: z.array(obj).max(MAX_PAYLOADS).describe("Payload objects to validate"),
      side: z.enum(["server", "client"]).default("server"),
    }),
    handler: ({ rules, payloads, side }) => ({
      results: evaluatePayloads(rules, payloads, side),
    }),
  });

  defineWritingTool(server, {
    name: "generate_inputs",
    title: "Generate boundary-biased test inputs (JSONL)",
    description:
      "Generates deterministic wire-form JSON inputs for a rule set, for the differential check: the full blank/non-blank matrix over each rule's fields (blank = missing, null, \"\", []), near-blank non-blanks (\" \", 0, false, {}), compare pair coupling (equal, ±1 unit, offsets, Z vs +00:00), required_when value coupling (exact and near misses), seeds from the conformance suite, then `count` random inputs (default 10000, max 50000) for a fixed `seed`. Field types come from the rules and the JSON Schema `properties`. A large set cannot fit in a tool result, so pass `outFile` (a NEW .jsonl path inside the roots): this is the ONLY write the server ever does, it never overwrites an existing file, and it is why this tool is not marked read-only. Without `outFile` the inputs are returned inline when they fit (about 80 KB), otherwise the call fails and asks for `outFile`. By default every input is well typed for `properties`: values that fail the type or format check (\"2023-02-29\", a string where a number belongs, [] or {} for a string field, \"\" for a date) and a missing `required` field are not generated, because validonce leaves those to field-level validation; set includeInvalid to add them. Always pass `properties` and `required` (or `document` + `schemaName`), or field types are guessed from the rules.",
    input: z.object({
      rules: z.unknown().describe("The rule set object: { version: 1, rules: [...] }"),
      properties: obj.optional().describe("JSON Schema `properties` of the target schema"),
      required: z.array(z.string()).optional().describe("Required property names of the target schema (taken from `document` + `schemaName` when given)"),
      document: obj.optional().describe("OpenAPI document to take the schema from"),
      schemaName: z.string().optional().describe("Schema name inside `document`"),
      seed: z.number().int().default(1).describe("Seed; the same seed gives the same inputs"),
      count: z.number().int().min(0).max(MAX_COUNT).default(DEFAULT_COUNT).describe("Number of random inputs, after the matrix and seeds"),
      includeInvalid: z.boolean().default(false),
      outFile: z.string().optional().describe("New .jsonl file inside the roots to write the inputs to"),
    }),
    handler: async ({ rules, properties, required, document, schemaName, seed, count, includeInvalid, outFile }) => {
      const g = generateInputs({
        rules,
        properties: propertiesFor(document, schemaName, properties),
        required: requiredFor(document, schemaName, required),
        seed,
        count,
        includeInvalid,
      });
      const jsonl = g.inputs.map((i) => JSON.stringify(i)).join("\n") + (g.inputs.length ? "\n" : "");
      const summary = {
        total: g.inputs.length,
        matrixSize: g.matrixSize,
        seedCount: g.seedCount,
        randomCount: g.randomCount,
        seed,
        fields: g.fields,
        sha256: createHash("sha256").update(jsonl).digest("hex"),
        bytes: Buffer.byteLength(jsonl),
      };
      if (outFile !== undefined) {
        const written = await writeNewJsonl(outFile, await roots(), jsonl);
        return { ...summary, outFile: written, preview: g.inputs.slice(0, 5) };
      }
      if (jsonl.length > INLINE_JSONL_CHARS)
        throw new ToolError(
          `${g.inputs.length} inputs (${summary.bytes} bytes) are too large to return inline. Pass outFile (a new .jsonl path inside the roots), or lower count.`,
        );
      return { ...summary, inputs: g.inputs, jsonl };
    },
  });

  defineReadOnlyTool(server, {
    name: "compare_results",
    title: "Compare an old validator's results with validonce's",
    description:
      "Differential check. Takes the rules, the inputs, and the old validator's result per input ({accept, paths[], error?}, same order). Runs validonce's evaluate on every input and returns a PASS/FAIL verdict, divergences (accept/reject differs; smallest inputs first, plus the keys present in every diverging input), field-location warnings (same verdict, different error field), old-validator errors as their own class (never counted as reject), per-rule coverage (a rule failed or passed fewer than `floor` times makes the verdict FAIL as not exercised), and a Markdown `report`. Pass inputs and results inline, or as `inputsPath` / `oldResultsPath` (JSONL or JSON array files inside the roots, read-only). The old validator should run only the migrated rules: its other checks (required, format) would show up as divergences. The server never runs your code, so it cannot shrink by re-running the old validator; it reports the smallest diverging inputs found instead.",
    input: z.object({
      rules: z.unknown().describe("The rule set object: { version: 1, rules: [...] }"),
      inputs: z.array(obj).optional(),
      inputsPath: z.string().optional().describe("JSONL file of inputs inside the roots"),
      oldResults: z.array(z.unknown()).optional().describe("One {accept, paths, error?} per input, same order"),
      oldResultsPath: z.string().optional().describe("JSONL file of old results inside the roots"),
      floor: z.number().int().min(0).default(20).describe("Each rule must fail and pass at least this many times"),
      minInputs: z.number().int().min(0).default(10000).describe("Fewest inputs for a PASS"),
      maxOldErrors: z.number().int().min(0).default(0).describe("Old-validator errors tolerated"),
      runner: z.object({ name: z.string().optional(), version: z.string().optional(), sandbox: z.string().optional() }).optional(),
      handwritten: z.array(z.object({ rule: z.string(), reason: z.string() })).optional().describe("Rules left hand-written, with reasons, for the report"),
    }),
    handler: async (a) => {
      if ((a.inputs === undefined) === (a.inputsPath === undefined))
        throw new ToolError("Pass exactly one of `inputs` or `inputsPath`.");
      if ((a.oldResults === undefined) === (a.oldResultsPath === undefined))
        throw new ToolError("Pass exactly one of `oldResults` or `oldResultsPath`.");
      const r = await roots();
      const inputs = a.inputs ?? (await loadJsonl(a.inputsPath as string, r));
      const old = a.oldResults ?? (await loadJsonl(a.oldResultsPath as string, r));
      return compareResults({
        rules: a.rules,
        inputs,
        old,
        floor: a.floor,
        minInputs: a.minInputs,
        maxOldErrors: a.maxOldErrors,
        runner: a.runner,
        handwritten: a.handwritten,
      });
    },
  });

  defineReadOnlyTool(server, {
    name: "generate_code",
    title: "Generate builder code or client wiring from a rule set",
    description:
      "Writes source text for a rule set (nothing is written to disk or run). target `csharp`: a model class and a `ValidonceValidator<T>` whose constructor uses RequiredWhen / Compare / If.* / AtLeastOneOf / ExactlyOneOf / AllOrNone. target `python`: a `ValidonceModel` with `__rules__` built from F / when / group builders. target `go`: a struct with json tags and a rule set built with `validonce.MustBuild[T]` (`When`, `Cmp`, `AtLeastOneOf`...; Huma and go-playground wiring in `notes`). target `java`: a record plus a `RuleDefinition` rules class using the `RuleSetBuilder` fluent API and `@ValidonceRules` (Spring; Kotlin in `notes`); `files` has both. target `typescript-rules`: `defineRules` with the `validonce/rules` builders plus a Fastify (TypeBox, `withRules`) or NestJS (DTO + `@ValidonceRules`) schema; pick with `framework`. target `vue`: a vee-validate composable (`toVeeSchema(withRules(...))` + `watchDependents`) and a single-file component. target `dom`: `attachRules(form, rules)` and the matching form markup (`files`). target `zod`, `react-hook-form`, `angular-reactive`: client wiring (`withRules`, `registerDeps`, `validonceGroupValidator`) with the rules embedded. Names: Go fields are exported PascalCase with json tags; Java record components are camelCase with `@JsonProperty` where the name differs; C# properties are PascalCase of the wire name (a [JsonPropertyName] is written when the default camelCase policy would not give the wire name back); Python attributes are the wire name when it is an identifier, else snake_case with an alias; pass `propertyNames` ({wireName: name}) to override, or `naming`. Field types come from `properties` / `document` + `schemaName`, else from the rules. Rules the builders cannot express (for example `path` on a C# required_when or compare) are listed in `unexpressible` and written as comments; `complete` is false then. Check the rules with check_rules first.",
    input: z.object({
      rules: z.unknown().describe("The rule set object: { version: 1, rules: [...] }"),
      target: z.enum(TARGETS),
      modelName: z.string().default("Model").describe("Model / class name (the validator is <name>Validator in C#); also the default rule-id prefix"),
      namespace: z.string().optional().describe("C# namespace (file-scoped), Go package name (default models) or Java package"),
      framework: z.enum(["fastify", "nestjs"]).default("fastify").describe("typescript-rules only: the server framework to wire"),
      properties: obj.optional().describe("JSON Schema `properties` of the target schema, for field types"),
      document: obj.optional().describe("OpenAPI document to take the schema from"),
      schemaName: z.string().optional().describe("Schema name inside `document`"),
      propertyNames: z.record(z.string(), z.string()).optional().describe("Explicit wire name -> property / attribute name"),
      naming: z.enum(NAMINGS).default("auto").describe("auto: PascalCase for C#, wire name or snake_case for Python"),
      includeModel: z.boolean().optional().describe("Also write the model class (default true for csharp and python) or a base-schema skeleton (default false for zod, react-hook-form, angular-reactive, vue; true for the go, java and typescript-rules targets)"),
    }),
    handler: ({ rules, target, modelName, namespace, framework, properties, document, schemaName, propertyNames, naming, includeModel }) =>
      generateCode({
        rules,
        target,
        modelName,
        namespace,
        framework,
        properties: propertiesFor(document, schemaName, properties),
        propertyNames,
        naming,
        includeModel,
      }),
  });

  return server;
}
