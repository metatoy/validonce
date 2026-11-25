// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Runs the ORIGINAL (pristine) fixture's validator over a JSONL file with the skill's runner scripts.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { runGo, runJava, wrapJs } from "./stacks.mjs";
import { evalsDir, skillsDir, testbeds } from "./util.mjs";

const scripts = join(skillsDir, "scripts");
const venvPython = process.env.VALIDONCE_EVAL_PYTHON ?? join(testbeds, "../python/.venv/bin/python");

export async function runOld(c, pristine, inputs, out, scratch) {
  const r = c.runner;
  const res = await run(c, pristine, inputs, out, scratch);
  // A validator can report an error on a name that is not a wire field (a Jakarta @AssertTrue method): the case maps it.
  if (res.ok && r.pathMap)
    writeFileSync(out, readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => {
      const o = JSON.parse(l);
      return JSON.stringify({ ...o, paths: [...new Set((o.paths ?? []).map((p) => r.pathMap[p] ?? p))] });
    }).join("\n") + "\n");
  return res;
}

async function run(c, pristine, inputs, out, scratch) {
  const r = c.runner;
  if (r.script === "go-project") return runGo(pristine, inputs, out, scratch);
  if (r.script === "java-project") return runJava(c, pristine, inputs, out, scratch);
  if (r.script === "oracle") {
    const { default: check } = await import(pathToFileURL(join(evalsDir, "oracles", r.module)).href);
    writeFileSync(out, readFileSync(inputs, "utf8").split("\n").filter(Boolean).map((l) => {
      const paths = check(JSON.parse(l));
      return JSON.stringify({ accept: paths.length === 0, paths });
    }).join("\n") + "\n");
    return { ok: true, header: "validonce-runner: hand-written oracle (no old validator to run)" };
  }
  let cmd, args, env = process.env;
  if (r.script === "run-js.mjs") {
    cmd = process.execPath;
    args = [join(scripts, "run-js.mjs"), r.wrapper ? wrapJs(pristine, scratch, r.wrapper) : join(pristine, r.entry), r.exportName, inputs, out, "--kind", r.kind];
  } else if (r.script === "run-pydantic.py") {
    cmd = "env";
    args = ["-i", "PATH=/usr/bin:/bin", venvPython, "-I", join(scripts, "run-pydantic.py"), join(pristine, r.module), r.className, inputs, out];
  } else {
    // FluentValidation: build the user's project and the runner template (one dotnet at a time), then run the dll scrubbed.
    const fx = join(scratch, "fv"), rn = join(scratch, "runner");
    for (const [proj, dir] of [[pristine, fx], [join(scripts, "dotnet-runner"), rn]]) {
      const b = spawnSync("dotnet", ["build", proj, "-c", "Release", "-o", dir, "-v", "q", "-nologo"], { encoding: "utf8" });
      if (b.status !== 0) return { ok: false, error: `dotnet build failed: ${(b.stdout + b.stderr).slice(-400)}` };
    }
    const dotnetDir = dirname(spawnSync("which", ["dotnet"], { encoding: "utf8" }).stdout.trim());
    cmd = "env";
    args = ["-i", `PATH=${dotnetDir}:/usr/bin:/bin`, ...(process.env.DOTNET_ROOT ? [`DOTNET_ROOT=${process.env.DOTNET_ROOT}`] : []),
      "dotnet", join(rn, "DotnetRunner.dll"), "--assembly", join(fx, r.assembly), "--validator", r.validator, "--model", r.model, "--inputs", inputs, "--out", out];
  }
  const p = spawnSync(cmd, args, { encoding: "utf8", env, timeout: 180_000 });
  return p.status === 0 ? { ok: true, header: (p.stderr.match(/validonce-runner:.*/) ?? [""])[0] } : { ok: false, error: `runner exit ${p.status}: ${p.stderr.slice(-400)}` };
}
