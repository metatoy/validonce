// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { defineExtension, type Plugin } from "kubb/kit";
import { collect, sortKeys } from "./collect";
import { type RuleSet, ValidonceFormatError } from "./types";
import { wrap } from "./wrap";

export interface PluginValidonceOptions {
  /** Zod module written by `pluginZod`, relative to the kubb output directory. Default `schemas.ts`. */
  zod?: string;
  /** Companion module to write, relative to the kubb output directory. Default `validonce.gen.ts`. */
  output?: string;
  /** Schema name to Zod export name, for exports the default kubb naming does not match. */
  map?: Record<string, string>;
}

export interface CompanionInput {
  /** Path of the OpenAPI JSON document. */
  openapi: string;
  /** Path of the Zod module `pluginZod` wrote. */
  zodFile: string;
  /** Path of the companion to write. */
  outFile: string;
  map?: Record<string, string>;
}

/**
 * Writes the companion module: the kubb Zod schemas re-exported wrapped with `withRules`.
 * Returns the warnings; throws an Error naming the problem when nothing can be written.
 */
export function writeCompanion(input: CompanionInput): string[] {
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(input.openapi, "utf8"));
  } catch (e) {
    throw new Error(
      `validonce: cannot read OpenAPI JSON ${input.openapi}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!existsSync(input.zodFile))
    throw new Error(
      `validonce: ${input.zodFile} not found; put pluginValidonce() after pluginZod() and set the \`zod\` option to the file pluginZod writes (it must be a single file, e.g. pluginZod({ output: { path: "./schemas.ts" } }))`,
    );
  let rules: Record<string, RuleSet>;
  try {
    rules = collect(doc, []);
  } catch (e) {
    if (e instanceof ValidonceFormatError)
      throw new Error(
        `validonce: invalid x-validonce in ${input.openapi}: ${e.message}`,
      );
    throw e;
  }
  if (Object.keys(rules).length === 0)
    throw new Error(`validonce: no x-validonce found in ${input.openapi}`);
  let spec = relative(dirname(input.outFile), input.zodFile).replaceAll(
    "\\",
    "/",
  );
  spec = spec.replace(/\.(?:ts|mts|cts)$/, "");
  if (!spec.startsWith(".")) spec = `./${spec}`;
  const result = wrap({
    doc,
    rules: sortKeys(rules) as Record<string, RuleSet>,
    zodSource: readFileSync(input.zodFile, "utf8"),
    zodImport: spec,
    style: "kubb",
    map: input.map ?? {},
    openapiLabel: basename(input.openapi),
  });
  if (result.errors.length > 0 || result.text === undefined)
    throw new Error(result.errors.map((m) => `validonce: ${m}`).join("\n"));
  mkdirSync(dirname(input.outFile), { recursive: true });
  writeFileSync(input.outFile, result.text);
  return result.warnings;
}

/**
 * kubb plugin: after `pluginZod()` has written its schemas, writes `validonce.gen.ts` next to
 * them. It re-exports each Zod schema that has `x-validonce` wrapped with `withRules`. Add it
 * after `pluginZod()` in `kubb.config.ts`; the OpenAPI input must be a local JSON file.
 */
export function pluginValidonce(options: PluginValidonceOptions = {}): Plugin {
  return defineExtension({
    kind: "plugin",
    meta: { name: "plugin-validonce", version: "0.4.0" },
    dependencies: ["plugin-zod"],
    hooks: {
      // By build end kubb has written plugin-zod's file to disk.
      "kubb:build:end"(ctx) {
        const input = ctx.config.input;
        const openapi = typeof input === "string" ? input : undefined;
        if (openapi === undefined)
          throw new Error(
            "validonce: pluginValidonce needs the kubb config `input` to be a path to an OpenAPI JSON file",
          );
        const at = (p: string) =>
          isAbsolute(p) ? p : resolve(ctx.outputDir, p);
        const warnings = writeCompanion({
          openapi: resolve(ctx.config.root, openapi),
          zodFile: at(options.zod ?? "schemas.ts"),
          outFile: at(options.output ?? "validonce.gen.ts"),
          ...(options.map ? { map: options.map } : {}),
        });
        for (const w of warnings) console.warn(`validonce: warning: ${w}`);
      },
    },
  })();
}
