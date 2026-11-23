// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// (c) Every "keep" item is still hand-written (its marker is still in the source file) and has a reason in the report.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRun } from "../lib/run.mjs";

export default function (_output, context) {
  const run = loadRun(context);
  const keeps = run.expected.keep;
  if (keeps.length === 0) return { pass: true, score: 1, reason: "no keep items" };
  const reportPath = join(run.work, "MIGRATION_REPORT.md");
  const report = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "";
  const problems = [];
  for (const k of keeps) {
    const srcPath = join(run.work, k.file);
    const src = existsSync(srcPath) ? readFileSync(srcPath, "utf8") : "";
    if (!new RegExp(k.marker).test(src)) problems.push(`${k.file}: hand-written check removed (${k.check})`);
    const re = new RegExp(k.mention, "i");
    // a report line that names the check and says more than just the name (a reason)
    const line = report.split("\n").find((l) => re.test(l) && l.replace(/[|*`#>\-\s]/g, "").length >= 30);
    if (!line) problems.push(`report gives no reason for keeping: ${k.check}`);
  }
  return { pass: problems.length === 0, score: 1 - problems.length / (keeps.length * 2), reason: problems.join("; ") || `${keeps.length} kept with reasons` };
}
