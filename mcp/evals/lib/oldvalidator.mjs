// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Runs the ORIGINAL (pristine) fixture's validator over a JSONL file with the skill's runner scripts.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { skillsDir, testbeds } from "./util.mjs";

const scripts = join(skillsDir, "scripts");
const venvPython = process.env.VALIDONCE_EVAL_PYTHON ?? join(testbeds, "../python/.venv/bin/python");

export function runOld(c, pristine, inputs, out, scratch) {
  const r = c.runner;
  let cmd, args, env = process.env;
  if (r.script === "run-js.mjs") {
    cmd = process.execPath;
    args = [join(scripts, "run-js.mjs"), join(pristine, r.entry), r.exportName, inputs, out, "--kind", r.kind];
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
