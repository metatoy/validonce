#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Re-scores a finished run directory with the current assertions, without running any agent (and without promptfoo).
//   node rescore.mjs <runDir>      runDir = the <case>__<variant>__<agent>__<id> folder (contains work/ and pristine/)
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { readdirSync } from "node:fs";

const runDir = resolve(process.argv[2] ?? "");
if (!existsSync(join(runDir, "work")) || !existsSync(join(runDir, "pristine"))) { console.error("usage: node rescore.mjs <runDir> (needs work/ and pristine/)"); process.exit(2); }
const caseId = basename(runDir).split("__")[0];
const context = { providerResponse: { metadata: { caseId, runDir, work: join(runDir, "work"), pristine: join(runDir, "pristine") } } };
let bad = 0;
for (const name of ["differential", "rules", "keep", "scope", "builds", "report"]) {
  const mod = await import(`./assertions/${name}.mjs`);
  const r = await mod.default("", context);
  if (!r.pass) bad++;
  console.log(`${r.pass ? "pass" : "FAIL"}  ${name.padEnd(13)} ${r.reason}`);
}
process.exit(bad ? 1 : 0);
