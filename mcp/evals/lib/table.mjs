// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { readFileSync } from "node:fs";

const METRICS = ["differential", "rules", "keep", "scope", "builds", "report"];

/** A plain table of a promptfoo results JSON: one row per provider and case, one column per deterministic assertion. */
export function resultsTable(file) {
  const rows = JSON.parse(readFileSync(file, "utf8")).results.results;
  const pad = (s, n) => String(s).padEnd(n);
  const lines = [pad("provider", 16) + pad("case", 20) + pad("total", 6) + METRICS.map((m) => pad(m, 13)).join("")];
  for (const r of [...rows].sort((a, b) => (a.vars.case + a.provider.label).localeCompare(b.vars.case + b.provider.label))) {
    if (r.error && !r.gradingResult) { lines.push(pad(r.provider.label, 16) + pad(r.vars.case, 20) + `ERROR ${r.error}`); continue; }
    const c = Object.fromEntries((r.gradingResult?.componentResults ?? []).filter((x) => x.assertion?.metric).map((x) => [x.assertion.metric, x.pass]));
    lines.push(pad(r.provider.label, 16) + pad(r.vars.case, 20) + pad(r.success ? "PASS" : "FAIL", 6) + METRICS.map((m) => pad(c[m] ? "pass" : "FAIL", 13)).join(""));
  }
  return lines.join("\n");
}
