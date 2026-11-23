// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Golden check, step 1: generate C# and Python for the Signup rules and every distinct rule set in
// conformance/rules/*.json. Writes sources to golden/out/ plus units.json (the expected rules).
// Bundled and run by golden/run.sh (esbuild), so it needs no TypeScript runner.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateCode } from "../../src/codegen";

const here = process.cwd(); // run.sh runs from this directory
const root = resolve(here, "../../..");
const out = resolve(here, "out");
rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, "csharp"), { recursive: true });
mkdirSync(resolve(out, "python"), { recursive: true });

interface Unit {
  name: string;
  source: string;
  rules: { version: 1; rules: unknown[] };
  properties?: Record<string, unknown>;
  csharp: { unexpressible: Array<{ ruleId: string; reason: string }> };
  python: { unexpressible: Array<{ ruleId: string; reason: string }> };
}
const units: Unit[] = [];

const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

// Signup, from the FastAPI golden OpenAPI document (properties give the field types).
const signup = read("conformance/golden/fastapi.openapi.json").components.schemas.Signup;
units.push({
  name: "Signup",
  source: "conformance/golden/fastapi.openapi.json",
  rules: signup["x-validonce"],
  properties: signup.properties,
  csharp: { unexpressible: [] },
  python: { unexpressible: [] },
});

const seen = new Set<string>();
let n = 0;
for (const f of readdirSync(resolve(root, "conformance/rules")).filter((x) => x.endsWith(".json")).sort()) {
  for (const c of read(`conformance/rules/${f}`).cases) {
    const rules = { version: 1 as const, rules: c.rules };
    const key = JSON.stringify(rules);
    if (seen.has(key)) continue;
    seen.add(key);
    n += 1;
    units.push({
      name: `U${String(n).padStart(3, "0")}`,
      source: `${f}#${c.id}`,
      rules,
      csharp: { unexpressible: [] },
      python: { unexpressible: [] },
    });
  }
}

for (const u of units) {
  const base = { rules: u.rules, modelName: u.name, properties: u.properties };
  const cs = generateCode({ ...base, target: "csharp", namespace: "Golden" });
  const py = generateCode({ ...base, target: "python" });
  u.csharp.unexpressible = cs.unexpressible;
  u.python.unexpressible = py.unexpressible;
  writeFileSync(resolve(out, `csharp/${u.name}.cs`), cs.source);
  writeFileSync(resolve(out, `python/${u.name.toLowerCase()}.py`), py.source);
}
writeFileSync(resolve(out, "units.json"), JSON.stringify(units, null, 2));
console.log(`generated ${units.length} units (${units.reduce((a, u) => a + u.rules.rules.length, 0)} rules)`);
