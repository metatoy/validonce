// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Scores a folder you ran by hand with Copilot agent mode in VS Code (see prepare-vscode.mjs). Calls no model.
// EVAL_VSCODE_RUN=<run-id> picks the run; run.json in the folder supplies model, credits and minutes.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { vscodeBase } from "../prepare-vscode.mjs";

export default class VscodeScoreProvider {
  constructor(options = {}) {
    this.providerId = options.id ?? "copilot-vscode";
  }
  id() {
    return this.providerId;
  }
  async callApi(_prompt, context) {
    const runId = process.env.EVAL_VSCODE_RUN;
    if (!runId) return { error: "set EVAL_VSCODE_RUN=<run-id> (or use score-vscode.mjs <run-id>)" };
    const caseId = context?.vars?.case;
    const base = vscodeBase(runId);
    const work = join(base, caseId);
    const runDir = join(base, ".score", caseId);
    if (!existsSync(work)) return { error: `case ${caseId} was not prepared for run ${runId}` };
    let run = {};
    try { run = JSON.parse(readFileSync(join(work, "run.json"), "utf8")); } catch (e) { return { error: `run.json unreadable: ${e.message}` }; }
    const credits = typeof run.credits === "number" ? run.credits : 0;
    return {
      output: `scored ${work} (model: ${run.model || "not recorded"})`,
      cost: credits * 0.01, // 1 Copilot credit = $0.01
      tokenUsage: { total: 0, prompt: 0, completion: 0 },
      metadata: {
        caseId, runId, work, pristine: join(runDir, "pristine"), runDir,
        credits, turns: 0, seconds: (typeof run.minutes === "number" ? run.minutes : 0) * 60,
        model: run.model, notes: run.notes, creditsRecorded: typeof run.credits === "number",
      },
    };
  }
}
