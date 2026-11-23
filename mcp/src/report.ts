// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Renders the migration report (Markdown). Input data is shown only inside fenced code blocks.

export interface RunnerInfo {
  name?: string;
  version?: string;
  sandbox?: string;
}

export interface Handwritten {
  rule: string;
  reason: string;
}

export interface ReportData {
  verdict: "PASS" | "FAIL";
  reasons: string[];
  totals: { inputs: number; agree: number; divergences: number; locationWarnings: number; oldErrors: number };
  coverage: Array<{ ruleId: string; failed: number; passed: number; exercised: boolean }>;
  floor: number;
  counterexamples: Array<{
    index: number;
    input: unknown;
    old: { accept: boolean; paths: string[] };
    new: { accept: boolean; paths: string[] };
    ruleIds: string[];
  }>;
  keysInEveryDivergence: string[];
  locationWarnings: Array<{ index: number; input: unknown; old: string[]; new: string[]; ruleIds: string[] }>;
  oldErrors: Array<{ message: string; count: number; firstIndex: number }>;
  runner?: RunnerInfo;
  handwritten?: Handwritten[];
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");

function fence(value: unknown): string {
  const body = JSON.stringify(value);
  let ticks = "```";
  while (body.includes(ticks)) ticks += "`";
  return `${ticks}json\n${body}\n${ticks}`;
}

export function renderReport(d: ReportData): string {
  const L: string[] = [];
  L.push(`# validonce migration report`, "");
  L.push(`**Verdict: ${d.verdict}**`, "");
  if (d.reasons.length) {
    for (const r of d.reasons) L.push(`- ${cell(r)}`);
    L.push("");
  }
  L.push("## Summary", "", "| | |", "|---|---|");
  L.push(`| Inputs compared | ${d.totals.inputs} |`);
  L.push(`| Agree (accept/reject identical) | ${d.totals.agree} |`);
  L.push(`| Divergences (hard gate) | ${d.totals.divergences} |`);
  L.push(`| Field-location warnings | ${d.totals.locationWarnings} |`);
  L.push(`| Old-validator errors (own class) | ${d.totals.oldErrors} |`, "");

  L.push(`## Per-rule coverage (floor ${d.floor} failed and ${d.floor} passed)`, "");
  L.push("| Rule | Failed | Passed | Exercised |", "|---|---|---|---|");
  for (const c of d.coverage)
    L.push(`| ${cell(c.ruleId)} | ${c.failed} | ${c.passed} | ${c.exercised ? "yes" : "**NO: not exercised**"} |`);
  L.push("");

  if (d.counterexamples.length) {
    L.push("## Divergences (smallest first)", "");
    if (d.keysInEveryDivergence.length)
      L.push(`Keys present in every diverging input: ${d.keysInEveryDivergence.map((k) => `\`${cell(k)}\``).join(", ")}`, "");
    for (const x of d.counterexamples) {
      L.push(`### Input #${x.index}`, "", `Rules involved: ${x.ruleIds.map((r) => `\`${cell(r)}\``).join(", ") || "none identified"}`, "");
      L.push(fence(x.input), "");
      L.push(`- old: ${x.old.accept ? "accept" : "reject"}${x.old.paths.length ? ` (${x.old.paths.map(cell).join(", ")})` : ""}`);
      L.push(`- validonce: ${x.new.accept ? "accept" : "reject"}${x.new.paths.length ? ` (${x.new.paths.map(cell).join(", ")})` : ""}`, "");
    }
  }
  if (d.locationWarnings.length) {
    L.push("## Field-location warnings", "", "Same verdict, different error field. Fix with an explicit `path` on the rule.", "");
    for (const w of d.locationWarnings) {
      L.push(`- input #${w.index}: old [${w.old.map(cell).join(", ")}] vs validonce [${w.new.map(cell).join(", ")}] (rules: ${w.ruleIds.map(cell).join(", ")})`);
    }
    L.push("");
  }
  if (d.oldErrors.length) {
    L.push("## Old-validator errors", "", "The old validator threw or could not parse these inputs. They are never counted as a reject.", "");
    for (const e of d.oldErrors) L.push(`- ${e.count}× (first at input #${e.firstIndex}): ${cell(e.message)}`);
    L.push("");
  }
  L.push("## Left hand-written", "");
  if (d.handwritten?.length) for (const h of d.handwritten) L.push(`- ${cell(h.rule)}: ${cell(h.reason)}`);
  else L.push("None reported.");
  L.push("", "## Runner", "");
  const r = d.runner;
  L.push(r ? `${cell(r.name ?? "unnamed")} ${cell(r.version ?? "")}; sandbox: ${cell(r.sandbox ?? "not reported")}` : "Not reported.", "");
  return L.join("\n");
}
