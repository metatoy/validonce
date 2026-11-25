// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

/**
 * orval has no plugin system, so validonce rides on two orval hooks:
 *  - `input.override.transformer` captures the parsed OpenAPI document (it also works for URL
 *    and object inputs), and
 *  - `hooks.afterAllFilesWrite` (function form) runs `wrap()` and writes `validonce.gen.ts`
 *    next to the generated Zod module.
 * `withValidonce(config)` installs both on every project; `createValidonce()` returns the two
 * pieces for users who compose their own hooks.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Config, Options } from "orval";
import { allRulesFromOpenApi } from "./openapi";
import type { RuleSet } from "./types";
import { wrap } from "./wrap";

export interface ValidonceOrvalOptions {
  /** Companion file name, written next to the Zod module. Default `validonce.gen.ts`. */
  fileName?: string;
  /**
   * The generated Zod module (`.ts` file). Default: `output.target` when `output.mode` is
   * `single`. Required for other modes, and for `createValidonce()` used without a config.
   */
  zodFile?: string;
  /** `Name=exportName` overrides, as `validonce wrap --map`. */
  map?: Record<string, string>;
}

type Hooks = NonNullable<Options["hooks"]>;
type HookCommand = NonNullable<Hooks["afterAllFilesWrite"]>;
type Transformer = (spec: never) => unknown;

interface OutputLike {
  client?: unknown;
  mode?: unknown;
  target?: unknown;
  workspace?: unknown;
  override?: { zod?: { version?: unknown; variant?: unknown } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Throws for Zod 3 and Zod Mini, which `validonce/zod` does not support. */
export function assertZod4(output: unknown, project = "orval"): void {
  const o = (isRecord(output) ? output : {}) as OutputLike;
  const z = o.override?.zod;
  if (o.client !== undefined && o.client !== "zod")
    throw new Error(
      `validonce: project "${project}": output.client is ${JSON.stringify(o.client)}; withValidonce needs client: "zod"`,
    );
  if (z?.version === 3)
    throw new Error(
      `validonce: project "${project}": override.zod.version is 3; validonce needs Zod 4 (set override.zod.version: 4)`,
    );
  if (z?.variant === "mini")
    throw new Error(
      `validonce: project "${project}": override.zod.variant is "mini"; validonce needs classic Zod 4 (zod/mini is not supported)`,
    );
}

/** `Name-Input` is reported as `Name` unless a plain `Name` already exists (same as the CLI). */
function collect(doc: unknown): Record<string, RuleSet> {
  const all = allRulesFromOpenApi(doc);
  const named: Record<string, RuleSet> = {};
  for (const name of Object.keys(all).sort()) {
    const plain = name.endsWith("-Input") ? name.slice(0, -6) : name;
    named[plain !== name && !Object.hasOwn(all, plain) ? plain : name] = all[
      name
    ] as RuleSet;
  }
  return named;
}

export interface Validonce {
  /** For `input.override.transformer`: records the document and returns it unchanged. */
  transformer: (spec: never) => unknown;
  /** For `hooks.afterAllFilesWrite`: writes the companion file. */
  afterAllFilesWrite: () => Promise<void>;
}

/**
 * The two pieces. `zodFile` is required here (there is no config to read it from), and
 * `fallbackInput` is a local JSON path read if the transformer never ran.
 */
export function createValidonce(
  options: ValidonceOrvalOptions & { zodFile: string },
  fallbackInput?: string,
  cwd: string = process.cwd(),
): Validonce {
  let doc: unknown;
  const zodFile = resolve(cwd, options.zodFile);
  const outFile = join(
    dirname(zodFile),
    options.fileName ?? "validonce.gen.ts",
  );
  return {
    transformer(spec) {
      doc = spec;
      return spec;
    },
    async afterAllFilesWrite() {
      let label = "the OpenAPI document";
      let d = doc;
      if (d === undefined && fallbackInput !== undefined) {
        const p = resolve(cwd, fallbackInput);
        d = JSON.parse(readFileSync(p, "utf8"));
        label = fallbackInput.split(/[\\/]/).pop() ?? label;
      }
      if (d === undefined)
        throw new Error(
          "validonce: no OpenAPI document was captured; add validonce's transformer to input.override.transformer (or use withValidonce)",
        );
      const rules = collect(d);
      const zodSource = readFileSync(zodFile, "utf8");
      let spec = relative(dirname(outFile), zodFile).replaceAll("\\", "/");
      spec = spec.replace(/\.(?:ts|mts|cts)$/, "");
      if (!spec.startsWith(".")) spec = `./${spec}`;
      const result = wrap({
        doc: d,
        rules,
        zodSource,
        zodImport: spec,
        style: "orval",
        map: options.map ?? {},
        openapiLabel: label,
      });
      for (const w of result.warnings) console.warn(`validonce: warning: ${w}`);
      if (result.errors.length > 0 || result.text === undefined)
        throw new Error(
          `validonce: ${result.errors.map((e) => `${e}`).join("\nvalidonce: ")}`,
        );
      mkdirSync(dirname(outFile), { recursive: true });
      writeFileSync(outFile, result.text);
    },
  };
}

function zodFileOf(
  project: string,
  o: OutputLike,
  options: ValidonceOrvalOptions,
): string {
  if (options.zodFile !== undefined) return options.zodFile;
  const mode = o.mode ?? "single";
  if (mode !== "single" || typeof o.target !== "string")
    throw new Error(
      `validonce: project "${project}": output.mode is ${JSON.stringify(mode)}; pass { zodFile } naming the generated Zod module`,
    );
  return typeof o.workspace === "string" && !isAbsolute(o.target)
    ? join(o.workspace, o.target)
    : o.target;
}

function compose(existing: HookCommand | undefined, ours: () => Promise<void>) {
  const list = existing === undefined ? [] : [existing].flat();
  // orval swallows a hook's error after logging it; also fail the process so CI notices.
  const guarded = async () => {
    try {
      await ours();
    } catch (e) {
      process.exitCode = 1;
      throw e;
    }
  };
  return [...list, guarded] as HookCommand;
}

function wrapProject(
  name: string,
  project: Options,
  options: ValidonceOrvalOptions,
): Options {
  const output = project.output;
  const o = (
    typeof output === "string" ? { target: output } : (output ?? {})
  ) as OutputLike;
  assertZod4(o, name);
  const zodFile = zodFileOf(name, o, options);

  const input = project.input;
  const inputOpts =
    typeof input === "string" || Array.isArray(input)
      ? { target: input }
      : (input ?? { target: "" });
  const target = inputOpts.target;
  const fallback = typeof target === "string" ? target : undefined;
  const v = createValidonce({ ...options, zodFile }, fallback);

  const existing = inputOpts.override?.transformer;
  let transformer: unknown;
  if (typeof existing === "function") {
    transformer = async (spec: never) =>
      v.transformer((await existing(spec)) as never);
  } else transformer = existing === undefined ? v.transformer : existing; // a path string: fall back to reading the input

  return {
    ...project,
    input: {
      ...inputOpts,
      override: {
        ...inputOpts.override,
        transformer: transformer as Transformer,
      },
    } as Options["input"],
    hooks: {
      ...project.hooks,
      afterAllFilesWrite: compose(
        project.hooks?.afterAllFilesWrite,
        v.afterAllFilesWrite,
      ),
    },
  };
}

/** Wraps an orval config: every project writes `validonce.gen.ts` next to its Zod module. */
export function withValidonce<T extends Config>(
  config: T,
  options: ValidonceOrvalOptions = {},
): T {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(config)) {
    if (
      name === "logLevel" ||
      typeof value === "string" ||
      value === undefined
    ) {
      out[name] = value;
    } else if (typeof value === "function") {
      out[name] = async () =>
        wrapProject(
          name,
          await (value as () => Promise<Options> | Options)(),
          options,
        );
    } else {
      out[name] = Promise.resolve(value as Options).then((p) =>
        wrapProject(name, p, options),
      );
    }
  }
  return out as T;
}
