// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// The differential check for the migration sources: for each library and contract (Signup, Contact),
// generate inputs with the MCP generator, run the hand-written old validator through its runner,
// and require compare_results to PASS with 0 divergences.
//   node check-sources.mjs [go-playground|jakarta|class-validator|joi|yup ...]   (default: all)
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "../../skills/validonce-migrate/scripts");
const out = mkdtempSync(join(tmpdir(), "vo-src-"));
const want = process.argv.slice(2);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    process.stderr.write(r.stdout ?? "");
    throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed (exit ${r.status})`);
  }
  return r.stdout;
}

// Each entry returns the command that writes @OUT from @IN for one contract.
const libs = {
  "go-playground": (c, i, o) => {
    const dir = join(out, `go-${c}`);
    cpSync(join(scripts, "run-go"), dir, { recursive: true });
    cpSync(join(here, "go-playground", c, "model.go"), join(dir, "model.go"));
    sh("go", ["build", "-o", "runner", "."], { cwd: dir });
    sh("./runner", [i, o], { cwd: dir });
  },
  jakarta: (c, i, o) => {
    sh("bash", [join(here, "jakarta/run.sh"), c, i, o, out]);
  },
  "class-validator": (c, i, o) =>
    sh("node", [join(scripts, "run-js.mjs"), join(here, `class-validator/${c}.ts`), cap(c), i, o, "--kind", "class-validator"]),
  joi: (c, i, o) => sh("node", [join(scripts, "run-js.mjs"), join(here, `joi/${c}.mjs`), cap(c), i, o, "--kind", "joi"]),
  // VeeValidate runs yup (or zod) schemas; the headless proof is the yup runner on the form-level checks.
  yup: (c, i, o) => sh("node", [join(scripts, "run-js.mjs"), join(here, `yup/${c}.mjs`), cap(c), i, o, "--kind", "yup"]),
};

const inputs = {};
for (const c of ["signup", "contact"]) {
  inputs[c] = join(out, `${c}.jsonl`);
  console.log(sh("node", [join(here, "diff.mjs"), "gen", c, inputs[c]]).trim());
}
let bad = 0;
for (const [lib, run] of Object.entries(libs)) {
  if (want.length && !want.includes(lib)) continue;
  for (const c of ["signup", "contact"]) {
    if (lib === "yup" && c === "signup") continue; // covered by check.mjs
    const o = join(out, `${lib}-${c}.jsonl`);
    try {
      run(c, inputs[c], o);
      const r = spawnSync("node", [join(here, "diff.mjs"), "compare", c, inputs[c], o], { encoding: "utf8" });
      console.log(`${lib}: ${r.stdout.split("\n")[0]}`);
      if (r.status !== 0) {
        console.log(r.stdout.split("\n").slice(1, 60).join("\n"));
        bad++;
      }
    } catch (e) {
      console.log(`${lib} ${c}: ${e.message}`);
      bad++;
    }
  }
}
process.exit(bad ? 1 : 0);
