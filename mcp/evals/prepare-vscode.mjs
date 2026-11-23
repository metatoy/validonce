#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Prepares one scratch folder per case for a manual run of Copilot agent mode in VS Code.
//   node prepare-vscode.mjs [case ...]      (default: the 5 before cases, tricky-arithmetic, tricky-async-db)
//   EVAL_RUN_ID=<id> to choose the run id.
// Layout: $TMPDIR/validonce-evals/vscode/<run-id>/<case>/          the folder you open in VS Code
//         $TMPDIR/validonce-evals/vscode/<run-id>/.score/<case>/   pristine copy and scoring scratch (not in the opened folder)
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CASES } from "./cases.mjs";
import { defaultRunId, prepare } from "./prepare.mjs";
import { evalsDir, scratchRoot } from "./lib/util.mjs";

export const DEFAULT_CASES = ["zod", "yup", "angular", "pydantic", "fluentvalidation", "tricky-arithmetic", "tricky-async-db"];

export const vscodeBase = (runId) => join(scratchRoot(), "vscode", runId);

const sheet = (caseId, runId) => `# Run sheet: ${caseId} (run ${runId})

1. Open this folder in VS Code (\`code <this folder>\`). Trust the workspace when asked.
2. Open Copilot Chat and switch to **Agent** mode.
3. Pick the model you want to measure and note it in \`run.json\`.
4. Check the validonce server is running: Chat > Configure Tools (or the MCP servers list) shows \`validonce\`; start it if it is stopped.
5. Note the start time. Paste the contents of \`PROMPT.md\` into the chat.
6. Allow the validonce tools and the terminal commands the agent asks for. The old-validator runner needs Node 22 (Zod, yup, Angular), \`.venv/bin/python\` (Pydantic) or the .NET SDK (FluentValidation); the folder has no network need.
7. Let it finish. Do not fix anything by hand and do not run the migration for it.
8. Note the minutes taken and the premium requests or credits used (Copilot usage in the status bar or your GitHub billing page).
9. Fill in \`run.json\`: \`{"model": "", "credits": null, "minutes": null, "notes": ""}\`.
10. Do not commit anything. When all folders are done, score them: \`node score-vscode.mjs ${runId}\` (from mcp/evals).

Use a new run id (a new \`prepare-vscode.mjs\` run) for every repeat, so each starts from a clean folder.
`;

export function prepareVscode(cases = DEFAULT_CASES, runId = process.env.EVAL_RUN_ID ?? defaultRunId()) {
  const base = vscodeBase(runId);
  const prompt = readFileSync(join(evalsDir, "prompt.txt"), "utf8");
  return cases.map((caseId) => {
    if (!CASES[caseId]) throw new Error(`unknown case: ${caseId}`);
    const work = join(base, caseId);
    const runDir = join(base, ".score", caseId);
    const prep = prepare({ caseId, agent: "vscode", runId, layout: { runDir, work, pristine: join(runDir, "pristine") } });
    writeFileSync(join(work, "PROMPT.md"), prompt);
    writeFileSync(join(work, "RUN-SHEET.md"), sheet(caseId, runId));
    writeFileSync(join(work, "run.json"), JSON.stringify({ model: "", credits: null, minutes: null, notes: "" }, null, 2) + "\n");
    return { caseId, folder: work, prep };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const cases = process.argv.slice(2);
  const runId = process.env.EVAL_RUN_ID ?? defaultRunId();
  const out = prepareVscode(cases.length ? cases : DEFAULT_CASES, runId);
  console.log(`run id: ${runId}\n`);
  for (const o of out) console.log(`code ${JSON.stringify(o.folder)}`);
  console.log(`\nWhen done: node score-vscode.mjs ${runId}`);
}
