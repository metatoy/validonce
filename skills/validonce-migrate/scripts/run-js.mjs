#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
//
// validonce-migrate runner: run a Zod schema, a yup schema or an Angular group
// validator over wire-JSON inputs, in a locked-down child process.
//
//   node run-js.mjs <entry-module> <exportName> <inputs.jsonl> <out.jsonl> [--kind zod|yup|angular]
//
// Run it from a scratch directory, with the user's consent. `esbuild` must be
// resolvable from the current directory or from this script (the user's project
// has it, or `npm i esbuild` in the scratch directory). --kind defaults to zod.
//
// Input line: a wire JSON object. Output line, one per input:
//   {"accept": bool, "paths": [top-level field names with errors], "error"?: "..."}
// A path-less issue is reported as "__root__" (map it by reading the validator).
// A validator that throws is reported with "error" and never counted as a reject.
//
// What each kind expects the module to export (`exportName`):
//   zod     a schema with safeParse. paths = first segment of each issue path.
//   yup     a schema with validate. Runs validate(input, { abortEarly: false });
//           paths = first segment of each inner[].path.
//   angular A FACTORY: `export function buildGroup(): FormGroup`, returning a fresh
//           FormGroup that already has every control and the group ValidatorFn
//           attached (copy the one from the component). The runner calls the
//           factory once per input, calls setValue(input[name] ?? null) on each
//           control (keys with no control are ignored), runs updateValueAndValidity,
//           then reads errors: accept = group.valid; paths = names of controls with
//           errors, plus "__root__" if only the group itself has errors.
//           (Extract the ValidatorFn and control list into a small module if the
//           component file imports Angular DI/DOM; the module must not do I/O.)
//
// Isolation (Node >= 22 permission model):
//   * the user's module is bundled with esbuild into one file in a scratch dir;
//     every import from the user's own code other than zod, yup, @angular/* (and
//     rxjs, which Angular needs) and relative files, and every node builtin, resolves to a stub that throws
//     "validonce runner: <module> needs I/O; isolate the schema module"
//     (that covers fs, node:net, http, axios, database clients, ...);
//   * the bundle runs in a child `node --permission --allow-fs-read=<bundle>`:
//     no file writes, no child processes, no worker threads, no addons, no WASI;
//   * empty environment (env: {}); inputs go in on stdin, results come back on
//     stdout, and only this parent writes <out.jsonl>;
//   * fetch/WebSocket/XMLHttpRequest are deleted in a prelude module that runs
//     first. Node 22's permission model has NO network switch (--allow-net exists
//     only in Node 25+), so this is a tripwire. For a real network block run the
//     whole script under `sandbox-exec -p '(version 1)(allow default)(deny network*)'`
//     (macOS) or `unshare -n` (Linux).

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const ki = argv.indexOf("--kind");
let kind = "zod";
if (ki >= 0) {
  kind = argv[ki + 1];
  argv.splice(ki, 2);
}
if (argv.length !== 4 || !["zod", "yup", "angular"].includes(kind)) {
  console.error(
    "usage: run-js.mjs <entry-module> <exportName> <inputs.jsonl> <out.jsonl> [--kind zod|yup|angular]",
  );
  process.exit(2);
}
const [entry, exportName, inputsPath, outPath] = argv.map((a, i) => (i === 1 ? a : resolve(a)));

function loadEsbuild() {
  for (const base of [join(process.cwd(), "noop.js"), fileURLToPath(import.meta.url), resolve(entry)]) {
    try {
      return createRequire(base)("esbuild");
    } catch {
      /* try next */
    }
  }
  console.error("validonce runner: esbuild not found; run `npm i esbuild` in the scratch directory");
  process.exit(2);
}
const esbuild = loadEsbuild();

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "validonce-run-")));
const bundle = join(scratch, "bundle.mjs");
const entryName = basename(entry);

const DRIVER = {
  zod: `
    const r = (await import("<<ENTRY>>"))["<<EXPORT>>"];
    export async function run(input) {
      const res = r.safeParse(input);
      if (res.success) return { accept: true, paths: [] };
      const paths = [];
      for (const i of res.error.issues) {
        const p = i.path.length ? String(i.path[0]) : "__root__";
        if (!paths.includes(p)) paths.push(p);
      }
      return { accept: false, paths };
    }`,
  yup: `
    const r = (await import("<<ENTRY>>"))["<<EXPORT>>"];
    export async function run(input) {
      try {
        await r.validate(input, { abortEarly: false });
        return { accept: true, paths: [] };
      } catch (e) {
        if (!e || e.name !== "ValidationError") throw e;
        const list = e.inner && e.inner.length ? e.inner : [e];
        const paths = [];
        for (const i of list) {
          const raw = i.path ? String(i.path) : "";
          const p = raw ? raw.split(/[.[]/)[0] : "__root__";
          if (!paths.includes(p)) paths.push(p);
        }
        return { accept: false, paths };
      }
    }`,
  angular: `
    import "@angular/compiler";
    const build = (await import("<<ENTRY>>"))["<<EXPORT>>"];
    export async function run(input) {
      const g = build();
      for (const name of Object.keys(g.controls)) {
        g.controls[name].setValue(Object.hasOwn(input, name) ? input[name] : null);
      }
      g.updateValueAndValidity();
      const paths = Object.keys(g.controls).filter((n) => g.controls[n].errors);
      if (!paths.length && g.errors) paths.push("__root__");
      return { accept: !g.invalid && !paths.length, paths };
    }`,
}[kind];

const PRELUDE = `for (const k of ["fetch","WebSocket","XMLHttpRequest","EventSource"]) { try { delete globalThis[k]; } catch (e) {} }`;
const MAIN = `
import "validonce-prelude";
import { run } from "validonce-driver";
let buf = "";
for await (const c of process.stdin) buf += c;
const out = [];
for (const line of buf.split("\\n")) {
  if (!line.trim()) continue;
  let res;
  try { res = await run(JSON.parse(line)); }
  catch (e) { res = { accept: false, paths: [], error: (e && e.name ? e.name + ": " : "") + (e && e.message ? e.message : String(e)) }; }
  out.push(JSON.stringify(res));
}
process.stdout.write(out.join("\\n") + (out.length ? "\\n" : ""));
`;

const ALLOWED = /^(zod|yup|rxjs|@angular\/[^/]+)(\/.*)?$/;
const plugin = {
  name: "validonce-runner",
  setup(b) {
    b.onResolve({ filter: /^validonce-(prelude|main|driver)$/ }, (a) => ({ path: a.path, namespace: "vo" }));
    b.onLoad({ filter: /.*/, namespace: "vo" }, (a) => {
      if (a.path === "validonce-main") return { contents: MAIN, resolveDir: scratch };
      if (a.path === "validonce-prelude") return { contents: PRELUDE };
      return {
        contents: DRIVER.replaceAll("<<ENTRY>>", entry.replaceAll("\\", "\\\\")).replaceAll("<<EXPORT>>", exportName),
        resolveDir: dirname(entry),
      };
    });
    b.onResolve({ filter: /^[^./]|^\.\.?$/ }, (a) => {
      if (a.namespace === "vo" && a.path.startsWith("validonce-")) return null;
      if (ALLOWED.test(a.path)) return null;
      // Pure-JS helpers of the allowed libraries (yup -> property-expr, ...) are
      // bundled; node builtins and anything the user's own code imports are stubbed.
      const builtin = a.path.startsWith("node:") || builtinModules.includes(a.path.split("/")[0]);
      if (!builtin && /[\\/]node_modules[\\/]/.test(a.importer)) return null;
      return { path: a.path, namespace: "stub" };
    });
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
      contents: `throw new Error(${JSON.stringify(`validonce runner: ${a.path} needs I/O; isolate the schema module`)});`,
    }));
  },
};

try {
  await esbuild.build({
    entryPoints: ["validonce-main"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    outfile: bundle,
    plugins: [plugin],
    logLevel: "error",
    absWorkingDir: dirname(entry),
    banner: { js: "// validonce runner bundle (generated)" },
  });
} catch (e) {
  console.error(`validonce runner: cannot bundle ${entryName}: ${e.message}`);
  process.exit(3);
}

const flags = ["--permission", `--allow-fs-read=${bundle}`, "--disable-warning=ExperimentalWarning"];
console.error(
  `validonce-runner: run-js kind=${kind} node=${process.version} esbuild=${esbuild.version} ` +
    `flags="${flags.slice(0, 2).join(" ").replace(bundle, "<bundle>")}" (no writes, no child_process, no workers) env=empty ` +
    "network=fetch/WebSocket removed (Node 22 has no --allow-net; use sandbox-exec/unshare -n for a real block)",
);

const child = spawnSync(process.execPath, [...flags, bundle], {
  input: readFileSync(inputsPath),
  env: {},
  encoding: "utf8",
  maxBuffer: 1 << 28,
  timeout: 300000,
});
if (child.status !== 0) {
  const lines = (child.stderr || "").split("\n");
  const msg = lines.find((l) => l.includes("validonce runner:")) ?? lines.find((l) => l.trim()) ?? "child failed";
  const m = /validonce runner: [^"]*/.exec(msg);
  console.error(m ? m[0] : msg);
  process.exit(3);
}
writeFileSync(outPath, child.stdout);
