// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// Usage: node compare.mjs [verdicts.json] [--all] [--case=prefix]
// Reads the Go program's `-json` output, runs the TypeScript evaluator (js/dist) on the
// hand-written validonce rule of each fixture case, and prints a per-case diff.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../../js/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "../../conformance/kubernetes");
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? join(here, "out/verdicts.json");
const all = args.includes("--all");
const only = args.find((a) => a.startsWith("--case="))?.slice(7) ?? "";
const verdicts = JSON.parse(readFileSync(file, "utf8"));
const byCase = new Map();
for (const v of verdicts) (byCase.get(v.case) ?? byCase.set(v.case, []).get(v.case)).push(v);

const totals = { agree: 0, diff: 0, celerr: 0, rejected: 0 };
const summary = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  for (const c of JSON.parse(readFileSync(join(dir, f), "utf8"))) {
    if (!c.id.startsWith(only)) continue;
    const rules = c.validonce.map((r, i) => ({ id: `${c.id}.${i}`, message: { key: "m" }, ...r }));
    const row = { agree: 0, diff: 0, celerr: 0, rejected: 0 };
    const lines = [];
    for (const v of byCase.get(c.id) ?? []) {
      const data = c.inputs[v.input].data;
      const vo = evaluate(rules, data).length > 0 ? "fail" : "pass";
      let cat;
      if (v.verdict === "rejected") cat = "rejected";
      else if (v.verdict === "error") cat = "celerr";
      else cat = v.verdict === vo ? "agree" : "diff";
      row[cat]++;
      totals[cat]++;
      if (all || cat !== "agree") lines.push(`   ${cat.toUpperCase().padEnd(8)} k8s=${v.verdict.padEnd(8)} vo=${vo}  ${v.note}${v.message && cat !== "diff" ? `\n      ↳ ${v.message.slice(0, 160)}` : ""}`);
    }
    summary.push(`${c.id.padEnd(40)} agree ${String(row.agree).padStart(3)}  DIFF ${String(row.diff).padStart(3)}  celerr ${String(row.celerr).padStart(3)}  rejected ${String(row.rejected).padStart(3)}`);
    if (lines.length) console.log(`\n## ${c.id} — ${c.description}\n   CEL: ${c.schema["x-kubernetes-validations"][c.rule].rule}\n${lines.join("\n")}`);
  }
}
console.log(`\n=== summary ===\n${summary.join("\n")}\n\ntotal: ${JSON.stringify(totals)}`);
