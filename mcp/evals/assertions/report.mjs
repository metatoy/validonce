// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// (f) MIGRATION_REPORT.md exists and has every heading of skills/validonce-migrate/assets/report-template.md.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRun } from "../lib/run.mjs";
import { reportHeadings } from "../lib/util.mjs";

export default function (_output, context) {
  const run = loadRun(context);
  const p = join(run.work, "MIGRATION_REPORT.md");
  if (!existsSync(p)) return { pass: false, score: 0, reason: "MIGRATION_REPORT.md not found" };
  const text = readFileSync(p, "utf8");
  const { headings, source } = reportHeadings();
  const have = [...text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1].replace(/[*_`]/g, "").toLowerCase());
  const missing = headings.filter((h) => !have.some((x) => x.includes(h.toLowerCase())));
  return { pass: missing.length === 0, score: 1 - missing.length / headings.length, reason: missing.length ? `missing headings: ${missing.join(", ")} (template: ${source})` : `all ${headings.length} headings present (template: ${source})` };
}
