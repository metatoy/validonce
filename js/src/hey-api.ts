// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

/**
 * Hey API plugin: writes `validonce.gen.ts` next to the `zod` plugin's output, re-exporting the
 * Zod schemas that have `x-validonce` rules wrapped with `withRules`. Hey API's own output is not
 * touched.
 *
 * ```ts
 * // openapi-ts.config.ts
 * import { validonce } from "validonce/hey-api";
 * export default { input: "api.json", output: "src/gen", plugins: ["zod", validonce()] };
 * ```
 *
 * Hey API's custom-plugin API is 0.x and unstable; the peer range is pinned tightly.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DefinePlugin } from "@hey-api/openapi-ts";
import { allRulesFromOpenApi } from "./openapi";
import { type RuleSet, ValidonceFormatError } from "./types";
import { pascal, wrap } from "./wrap";

export interface ValidonceUserConfig {
  /** File name written next to the Zod output. */
  fileName?: string;
}
type ValidoncePlugin = DefinePlugin<
  ValidonceUserConfig & { name: any },
  { name: any; fileName: string }
>;

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, o[k] as T]),
  );
}

const plugin: ValidoncePlugin["Config"] = {
  name: "validonce" as never,
  dependencies: ["zod"],
  config: { fileName: "validonce.gen.ts" } as never,
  handler: ({ plugin }) => {
    const zod = plugin.getPlugin("zod");
    if (!zod) throw new Error("validonce: the 'zod' plugin must be enabled");
    const cfg = zod.config as {
      compatibilityVersion?: unknown;
      definitions?: { enabled?: boolean };
    };
    if (
      cfg.compatibilityVersion !== undefined &&
      cfg.compatibilityVersion !== 4
    )
      throw new Error(
        `validonce: withRules needs Zod 4, but the zod plugin has compatibilityVersion ${JSON.stringify(cfg.compatibilityVersion)}; set compatibilityVersion: 4`,
      );
    if (cfg.definitions?.enabled === false)
      throw new Error(
        "validonce: the zod plugin has definitions disabled, so there are no component schemas to wrap",
      );

    const doc = plugin.context.spec as unknown;
    // `Name-Input` is reported as `Name` unless a plain `Name` exists (as `validonce wrap` does).
    let all: Record<string, RuleSet>;
    try {
      all = allRulesFromOpenApi(doc);
    } catch (e) {
      if (e instanceof ValidonceFormatError)
        throw new Error(`validonce: invalid x-validonce: ${e.message}`);
      throw e;
    }
    const rules: Record<string, RuleSet> = {};
    for (const [name, rs] of Object.entries(all)) {
      const plain = name.endsWith("-Input") ? name.slice(0, -6) : name;
      rules[plain !== name && !Object.hasOwn(all, plain) ? plain : name] = rs;
    }
    if (Object.keys(rules).length === 0) return; // nothing to wrap: write nothing

    // The zod plugin writes its file after this handler runs, so derive the export names it will
    // produce (`z{Name}`, PascalCase) from the schemas instead of reading the file.
    const c = (doc as { components?: { schemas?: Record<string, unknown> } })
      .components;
    const zodSource = Object.keys(c?.schemas ?? {})
      .map((n) => `export const z${pascal(n)} = null;`)
      .join("\n");

    const result = wrap({
      doc,
      rules: sortKeys(rules),
      zodSource,
      zodImport: "./zod.gen",
      style: "hey-api",
      map: {},
      openapiLabel: "the OpenAPI input",
    });
    for (const w of result.warnings) console.warn(`validonce: warning: ${w}`);
    if (result.errors.length > 0 || result.text === undefined)
      throw new Error(`validonce: ${result.errors.join("\n")}`);

    const outDir = (plugin.context.config as { output: { path: string } })
      .output.path;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, plugin.config.fileName), result.text);
  },
};

/**
 * The plugin config for `plugins: [..., "zod", validonce()]`. Equivalent to Hey API's
 * `definePluginConfig` (a shallow merge of the user config), inlined so this module needs
 * `@hey-api/openapi-ts` for types only.
 */
export function validonce(
  userConfig?: ValidonceUserConfig,
): ValidoncePlugin["Config"] {
  return { ...plugin, config: { ...plugin.config, ...userConfig } as never };
}
