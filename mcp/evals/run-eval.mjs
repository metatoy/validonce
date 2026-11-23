#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Wrapper around `promptfoo eval`: results and promptfoo's own state go under $TMPDIR/validonce-evals only,
// telemetry/sharing/update checks are off, and real agents need the budget gate.
//   node run-eval.mjs <claude|copilot|replay-good|replay-bad|a,b> [extra promptfoo args...]
// Real agents: VALIDONCE_EVAL_APPROVED=1 VALIDONCE_EVAL_BUDGET="<usd or credits you set>" node run-eval.mjs claude
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ensureDir, evalsDir, scratchRoot } from "./lib/util.mjs";
import { defaultRunId } from "./prepare.mjs";

const [providers = "", ...rest] = process.argv.slice(2);
if (!providers) { console.error("usage: node run-eval.mjs <provider[,provider]> [promptfoo args]"); process.exit(2); }
const real = providers.split(",").some((p) => p === "claude" || p === "copilot");
if (real && (process.env.VALIDONCE_EVAL_APPROVED !== "1" || !process.env.VALIDONCE_EVAL_BUDGET)) {
  console.error("Budget gate: real agents spend model tokens / Copilot credits. Set a budget first, then:\n  VALIDONCE_EVAL_APPROVED=1 VALIDONCE_EVAL_BUDGET=<amount> node run-eval.mjs " + providers + "\nPrint the matrix with: pnpm --filter validonce-mcp-evals matrix");
  process.exit(3);
}
const runId = process.env.EVAL_RUN_ID ?? defaultRunId();
const results = ensureDir(join(scratchRoot(), "results"));
const out = join(results, `${runId}-${providers.replace(/,/g, "+")}.json`);
const filter = "^(" + providers.split(",").join("|") + ")$";
const r = spawnSync(join(evalsDir, "node_modules/.bin/promptfoo"), ["eval", "-c", "promptfooconfig.yaml", "--filter-providers", filter, "--output", out, "--no-share", ...rest], {
  cwd: evalsDir,
  stdio: "inherit",
  env: {
    ...process.env, EVAL_RUN_ID: runId,
    PROMPTFOO_DISABLE_TELEMETRY: "1", PROMPTFOO_DISABLE_UPDATE: "1", PROMPTFOO_DISABLE_SHARING: "1",
    PROMPTFOO_CONFIG_DIR: ensureDir(join(scratchRoot(), "promptfoo-home")),
  },
});
console.error(`results: ${out}`);
process.exit(r.status ?? 1);
