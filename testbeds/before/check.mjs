// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// Runs every "before" fixture through its runner and compares with validonce's
// evaluate (js/dist): accept equality and path equality, per input.
//   node check.mjs [zod|yup|angular|pydantic|fluentvalidation ...]   (default: all)
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../../js/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "../../skills/validonce-migrate/scripts");
const inputs = join(here, "inputs/signup.jsonl");
const out = mkdtempSync(join(tmpdir(), "vo-check-"));

const rules = [
  { id: "Signup.required_when.company", kind: "required_when", field: "company",
    when: { eq: { field: "plan", value: "pro" } }, message: { key: "rules.company_required" } },
  { id: "Signup.compare.end", kind: "compare", left: { field: "end" }, op: "ge",
    right: { field: "start" }, type: "date", message: { key: "rules.end_after_start" } },
  { id: "Signup.compare.quantity", kind: "compare", left: { field: "quantity" }, op: "ge",
    right: { value: 1 }, type: "number", message: { key: "rules.quantity_min", params: { min: 1 } } },
];

// FluentValidation: build the fixture and the C# runner template once (dotnet builds one at a time),
// then run the runner under a scrubbed environment.
function dotnetFixture() {
  const fx = join(out, "fv");
  const rn = join(out, "runner");
  for (const [proj, dir] of [[join(here, "fluentvalidation"), fx], [join(scripts, "dotnet-runner"), rn]]) {
    const b = spawnSync("dotnet", ["build", proj, "-c", "Release", "-o", dir, "-v", "q", "-nologo"], { encoding: "utf8" });
    if (b.status !== 0) { process.stderr.write(b.stdout + b.stderr); throw new Error("dotnet build failed"); }
  }
  const dotnetDir = dirname(spawnSync("which", ["dotnet"], { encoding: "utf8" }).stdout.trim());
  const env = ["-i", `PATH=${dotnetDir}:/usr/bin:/bin`, ...(process.env.DOTNET_ROOT ? [`DOTNET_ROOT=${process.env.DOTNET_ROOT}`] : [])];
  return ["env", [...env, "dotnet", join(rn, "DotnetRunner.dll"), "--assembly", join(fx, "Before.Fluent.dll"),
    "--validator", "Before.SignupValidator", "--model", "Before.Signup", "--inputs", inputs, "--out", "@OUT"]];
}

const fixtures = {
  zod: ["node", [join(scripts, "run-js.mjs"), join(here, "zod/signup.mjs"), "Signup", inputs, "@OUT", "--kind", "zod"]],
  yup: ["node", [join(scripts, "run-js.mjs"), join(here, "yup/signup.mjs"), "Signup", inputs, "@OUT", "--kind", "yup"]],
  angular: ["node", [join(scripts, "run-js.mjs"), join(here, "angular/signup.mjs"), "buildSignupGroup", inputs, "@OUT", "--kind", "angular"]],
  pydantic: ["env", ["-i", "PATH=/usr/bin:/bin", join(here, "pydantic/.venv/bin/python"), "-I",
    join(scripts, "run-pydantic.py"), join(here, "pydantic/signup.py"), "Signup", inputs, "@OUT"]],
};

const want = process.argv.slice(2);
const lines = readFileSync(inputs, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const expected = lines.map((d) => {
  const issues = evaluate(rules, d);
  return { accept: issues.length === 0, paths: [...new Set(issues.map((i) => i.path[0]))].sort() };
});

let bad = 0;
fixtures.fluentvalidation = null; // built lazily
for (const [name, fixture] of Object.entries(fixtures)) {
  if (want.length && !want.includes(name)) continue;
  const [cmd, args] = fixture ?? dotnetFixture();
  const o = join(out, `${name}.jsonl`);
  const r = spawnSync(cmd, args.map((a) => (a === "@OUT" ? o : a)), { encoding: "utf8", env: { ...process.env } });
  process.stderr.write(r.stderr);
  if (r.status !== 0) { console.log(`${name}: runner failed (exit ${r.status})`); bad++; continue; }
  const got = readFileSync(o, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  let ok = 0;
  got.forEach((g, i) => {
    const e = expected[i];
    const same = g.accept === e.accept && JSON.stringify([...g.paths].sort()) === JSON.stringify(e.paths) && !g.error;
    if (same) ok++;
    else console.log(`  MISMATCH ${name} #${i} ${JSON.stringify(lines[i])}\n    got ${JSON.stringify(g)} want ${JSON.stringify(e)}`);
  });
  console.log(`${name}: ${ok}/${expected.length} match`);
  if (ok !== expected.length || got.length !== expected.length) bad++;
}
process.exit(bad ? 1 : 0);
