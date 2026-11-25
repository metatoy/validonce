// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// Differential test: translate each fixture's CEL with validonce/kubernetes, evaluate the rules that
// were translated with the TypeScript evaluator, and compare with the Kubernetes verdicts produced by
// the Go program (`go run . -json > out/verdicts.json`).
//
// Usage: node translate-and-eval.mjs [verdicts.json] [--allow-all] [--verbose]
//   --allow-all  debugging: treat every row as `guarded` instead of using the shipped allowlist.
// Exit 1 when a translated rule is STRICT somewhere (validonce fails, Kubernetes passes), when a case
// that must stay server_only (`expect: "server_only"`) was translated and disagrees anywhere, or when
// a verdict is missing. Lenient differences (validonce passes, Kubernetes fails or errors) are counted.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../../js/dist/index.js";
import { ROW_IDS, translateKubernetesSchema } from "../../js/dist/kubernetes.js";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "../../conformance/kubernetes");
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const file = args.find((a) => !a.startsWith("--")) ?? join(here, "out/verdicts.json");
const translations = args.includes("--allow-all") ? Object.fromEntries(ROW_IDS.map((r) => [r, "guarded"])) : undefined;

const byCase = new Map();
for (const v of JSON.parse(readFileSync(file, "utf8"))) {
  if (!byCase.has(v.case)) byCase.set(v.case, []);
  byCase.get(v.case).push(v);
}

const tot = { cases: 0, translated: 0, serverOnly: 0, inputs: 0, agree: 0, strict: 0, lenient: 0, rejectedSkipped: 0, errorServerRejects: 0, compileErrors: 0 };
const failures = [];
const notes = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  for (const c of JSON.parse(readFileSync(join(dir, f), "utf8"))) {
    tot.cases++;
    const verdicts = byCase.get(c.id);
    if (!verdicts || verdicts.length !== c.inputs.length) {
      failures.push(`${c.id}: expected ${c.inputs.length} Kubernetes verdicts, got ${verdicts?.length ?? 0} (run the Go program first)`);
      continue;
    }
    const tr = translateKubernetesSchema(c.schema, { schemaName: c.id, ...(translations ? { translations } : {}) });
    const entry = tr.report.find((r) => r.index === c.rule && r.schemaPath === "");
    const translated = entry?.outcome === "translated";
    translated ? tot.translated++ : tot.serverOnly++;
    if (c.expect === "translated" && !translated) notes.push(`${c.id}: expected translated, got server_only (${entry?.reason})`);
    if (!translated) continue;
    const rules = tr.schema["x-validonce"].rules.filter((r) => r.server_only !== true);
    let strict = 0;
    let lenient = 0;
    const strictList = [];
    for (const v of verdicts) {
      tot.inputs++;
      if (v.verdict === "rejected") { tot.rejectedSkipped++; continue; }
      if (v.stage === "compile") { tot.compileErrors++; continue; } // the CRD could not be created
      const vo = evaluate(rules, c.inputs[v.input].data, { side: "client" }).length > 0 ? "fail" : "pass";
      if (v.verdict === "error") {
        if (vo === "pass") { lenient++; tot.lenient++; } else tot.errorServerRejects++;
      } else if (v.verdict === vo) tot.agree++;
      else if (vo === "fail") { strict++; tot.strict++; strictList.push(`${v.note}  (k8s pass, vo fail)`); }
      else { lenient++; tot.lenient++; }
    }
    if (strict) failures.push(`${c.id} [${entry.cel}]: ${strict} STRICT\n      ${strictList.slice(0, 5).join("\n      ")}`);
    else if (c.expect === "server_only" && lenient) failures.push(`${c.id} [${entry.cel}]: must stay server_only but was translated, ${lenient} lenient difference(s)`);
    if (verbose || (lenient && !strict)) notes.push(`${c.id}: translated, ${lenient} lenient, ${strict} strict`);
  }
}
console.log(`cases ${tot.cases}: translated ${tot.translated}, server_only ${tot.serverOnly}`);
console.log(`inputs on translated rules ${tot.inputs}: agree ${tot.agree}, STRICT ${tot.strict}, lenient ${tot.lenient}, k8s error + validonce fails ${tot.errorServerRejects}, rejected before CEL ${tot.rejectedSkipped}, rule does not compile ${tot.compileErrors}`);
if (notes.length) console.log(`\nnotes:\n  ${notes.join("\n  ")}`);
if (failures.length) {
  console.error(`\nFAILED (${failures.length}):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nOK: no strict differences on translated rules");
