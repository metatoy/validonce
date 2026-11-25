// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { defineExtension, type Plugin } from "kubb/kit";
import { collect, sortKeys } from "./collect";
import { type RuleSet, ValidonceFormatError } from "./types";
import { wrap } from "./wrap";

export interface PluginValidonceOptions {
  /**
   * Zod output of `pluginZod`, relative to the kubb output directory: one file (`schemas.ts`)
   * or the directory of per-schema files. Default: `schemas.ts` if it exists, else `zod`
   * (kubb's own default).
   */
  zod?: string;
  /** Companion module to write, relative to the kubb output directory. Default `validonce.gen.ts`. */
  output?: string;
  /** Schema name to Zod export name, for exports the default kubb naming does not match. */
  map?: Record<string, string>;
}

export interface CompanionInput {
  /** Path of the OpenAPI JSON document. */
  openapi: string;
  /** Path of the Zod file `pluginZod` wrote, or the directory of its per-schema files. */
  zodFile: string;
  /** Path of the companion to write. */
  outFile: string;
  map?: Record<string, string>;
}

/** The `.ts` files under a pluginZod output directory, barrels excluded, in a stable order. */
function zodFilesIn(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...zodFilesIn(p));
    else if (/\.ts$/.test(e.name) && !/\.d\.ts$|^index\.ts$/.test(e.name))
      out.push(p);
  }
  return out.sort();
}

/**
 * Directory layout: rewrite the single `import * as _gen` of wrap's output so each wrapped
 * schema is imported from the file that defines it, and re-export the rest from the barrel.
 */
function perFileImports(
  text: string,
  files: string[],
  dir: string,
  spec: (p: string) => string,
): string {
  const owner = new Map<string, string>();
  for (const f of files)
    for (const m of readFileSync(f, "utf8").matchAll(
      /^export const (\w+)\s*(?::[^=]+)?=/gm,
    ))
      if (!owner.has(m[1] as string)) owner.set(m[1] as string, f);
  const imports = new Map<string, string>(); // file -> namespace alias
  const body = text.replace(
    /^(export const (\w+) = _withRules\()_gen\.\2,/gm,
    (_all, head: string, name: string) => {
      const f = owner.get(name) as string;
      let alias = imports.get(f);
      if (alias === undefined) {
        alias = `_src${imports.size}`;
        imports.set(f, alias);
      }
      return `${head}${alias}.${name},`;
    },
  );
  const importLines = [...imports].map(
    ([f, alias]) => `import * as ${alias} from ${JSON.stringify(spec(f))};`,
  );
  const barrel = resolve(dir, "index.ts");
  const reexport = existsSync(barrel)
    ? [`export * from ${JSON.stringify(spec(barrel))};`]
    : files.map((f) => `export * from ${JSON.stringify(spec(f))};`);
  const gen = body.match(/^import \* as _gen from .*$/m);
  return body.replace(gen?.[0] ?? "", [...importLines, ...reexport].join("\n"));
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
      `validonce: ${input.zodFile} not found; put pluginValidonce() after pluginZod() and set the \`zod\` option to the file or directory pluginZod writes`,
    );
  const isDir = statSync(input.zodFile).isDirectory();
  const files = isDir ? zodFilesIn(input.zodFile) : [];
  if (isDir && files.length === 0)
    throw new Error(`validonce: no Zod schema files in ${input.zodFile}`);
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
  const spec = (p: string) => {
    let r = relative(dirname(input.outFile), p).replaceAll("\\", "/");
    r = r.replace(/\.(?:ts|mts|cts)$/, "");
    return r.startsWith(".") ? r : `./${r}`;
  };
  const result = wrap({
    doc,
    rules: sortKeys(rules) as Record<string, RuleSet>,
    zodSource: isDir
      ? files.map((f) => readFileSync(f, "utf8")).join("\n")
      : readFileSync(input.zodFile, "utf8"),
    zodImport: spec(input.zodFile),
    style: "kubb",
    map: input.map ?? {},
    openapiLabel: basename(input.openapi),
  });
  if (result.errors.length > 0 || result.text === undefined)
    throw new Error(result.errors.map((m) => `validonce: ${m}`).join("\n"));
  const text = isDir
    ? perFileImports(result.text, files, input.zodFile, spec)
    : result.text;
  mkdirSync(dirname(input.outFile), { recursive: true });
  writeFileSync(input.outFile, text);
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
    meta: { name: "plugin-validonce", version: "0.5.0" },
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
        const zod =
          options.zod ?? (existsSync(at("schemas.ts")) ? "schemas.ts" : "zod");
        const warnings = writeCompanion({
          openapi: resolve(ctx.config.root, openapi),
          zodFile: at(zod),
          outFile: at(options.output ?? "validonce.gen.ts"),
          ...(options.map ? { map: options.map } : {}),
        });
        for (const w of warnings) console.warn(`validonce: warning: ${w}`);
      },
    },
  })();
}
