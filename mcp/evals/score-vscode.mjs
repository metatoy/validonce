#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Scores the folders of one manual VS Code run with the deterministic assertions. No model is called.
//   node score-vscode.mjs <run-id>
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CASES, caseDescription } from "./cases.mjs";
import { resultsTable } from "./lib/table.mjs";
import { ensureDir, evalsDir, scratchRoot } from "./lib/util.mjs";
import { vscodeBase } from "./prepare-vscode.mjs";

const runId = process.argv[2];
if (!runId) { console.error("usage: node score-vscode.mjs <run-id>"); process.exit(2); }
const base = vscodeBase(runId);
if (!existsSync(base)) { console.error(`no prepared run at ${base}`); process.exit(2); }
const cases = readdirSync(base).filter((n) => CASES[n]);
if (!cases.length) { console.error(`no case folders in ${base}`); process.exit(2); }
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = `^(${cases.map((c) => esc(caseDescription(c))).join("|")})$`; // the test descriptions tests.mjs builds
const out = join(ensureDir(join(scratchRoot(), "results")), `${runId}-copilot-vscode.json`);
const r = spawnSync(join(evalsDir, "node_modules/.bin/promptfoo"), ["eval", "-c", "promptfooconfig.yaml", "--filter-providers", "^copilot-vscode$", "--filter-pattern", pattern, "--repeat", "1", "--output", out, "--no-share", "--no-table"], {
  cwd: evalsDir, stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, EVAL_VSCODE_RUN: runId, PROMPTFOO_DISABLE_TELEMETRY: "1", PROMPTFOO_DISABLE_UPDATE: "1", PROMPTFOO_DISABLE_SHARING: "1", PROMPTFOO_CONFIG_DIR: ensureDir(join(scratchRoot(), "promptfoo-home")) },
});
if (!existsSync(out)) process.exit(r.status ?? 1);
console.log(resultsTable(out));
console.log(`\nresults: ${out}`);
