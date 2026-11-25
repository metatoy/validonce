// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// The differential check, driven by the MCP server's own functions (generate_inputs, compare_results):
//   node diff.mjs gen <signup|contact> <inputs.jsonl> [count]
//   node diff.mjs compare <signup|contact> <inputs.jsonl> <results.jsonl>   (exit 1 unless PASS)
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { contracts } from "./contracts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "vo-diff-"));
const entry = join(dir, "entry.ts");
const mcp = join(here, "../../mcp/src");
writeFileSync(entry, `export { generateInputs } from ${JSON.stringify(join(mcp, "generate"))};\nexport { compareResults } from ${JSON.stringify(join(mcp, "compare"))};\n`);
buildSync({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: join(dir, "m.mjs"), logLevel: "error", absWorkingDir: here, nodePaths: [join(here, "../../mcp/node_modules")] });
const { generateInputs, compareResults } = await import(pathToFileURL(join(dir, "m.mjs")).href);

const [mode, name, a, b] = process.argv.slice(2);
const c = contracts[name];
if (!c) { console.error("unknown contract"); process.exit(2); }
const jsonl = (p) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

if (mode === "gen") {
  const g = generateInputs({ rules: { version: 1, rules: c.rules }, properties: c.properties, required: c.required, seed: 1, count: Number(b ?? 10000) });
  writeFileSync(a, g.inputs.map((i) => JSON.stringify(i)).join("\n") + "\n");
  console.log(`${name}: ${g.inputs.length} inputs (matrix ${g.matrixSize}, random ${g.randomCount})`);
} else if (mode === "compare") {
  const inputs = jsonl(a);
  const r = compareResults({ rules: { version: 1, rules: c.rules }, inputs, old: jsonl(b), floor: 20, minInputs: 10000, maxOldErrors: 0 });
  console.log(`${name}: ${r.verdict} inputs=${inputs.length} divergences=${r.totals?.divergences ?? JSON.stringify(r.totals)} locationWarnings=${r.locationWarnings?.length ?? 0} oldErrors=${r.oldErrors.count}`);
  if (r.verdict !== "PASS") { console.log(r.report ?? JSON.stringify(r, null, 1).slice(0, 4000)); process.exit(1); }
} else process.exit(2);
