// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// (a) Differential: the agent's NEW validonce rules vs the ORIGINAL fixture's validator, with the same
// generate_inputs / compare_results the agent has. Hard gate: PASS with 0 divergences.
// The inputs come from the case's EXPECTED rules plus the fixture's field types (dates as format: date), unioned with
// inputs generated from the agent's own rules, so a legitimate rule variant (e.g. compare type "string") is still
// exercised with realistic values. The input set must exercise the expected rules (floor), and the agent's rules
// must pass compare_results on it.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRun, readAgentRules } from "../lib/run.mjs";
import { withMcp } from "../lib/mcp.mjs";
import { runOld } from "../lib/oldvalidator.mjs";

const MIN_INPUTS = 10_000;
const readJsonl = (p) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

export default async function (_output, context) {
  const run = loadRun(context);
  if (run.expected.migrate.length === 0) {
    const r = readAgentRules(run.work);
    const n = r.rules?.length ?? 0;
    return { pass: n === 0, score: n === 0 ? 1 : 0, reason: n === 0 ? "nothing to migrate and nothing proposed" : `${n} rule(s) proposed where none may be migrated` };
  }
  const agent = readAgentRules(run.work);
  if (agent.error) return { pass: false, score: 0, reason: agent.error };
  if (agent.rules.length === 0) return { pass: false, score: 0, reason: "no rules to prove" };
  const c = run.case;
  const diff = join(run.runDir, "diff");
  mkdirSync(diff, { recursive: true });
  const expectedSet = { version: 1, rules: run.expected.migrate };
  try {
    return await withMcp([diff], async (call) => {
      // Most random inputs are dropped by the well-formedness filter, so draw more seeds until the set is big enough.
      const gens = [];
      const jobs = [["expected", expectedSet, 50000, 1], ["agent", agent.ruleSet, 20000, 100], ...[2, 3, 4, 5, 6].map((n) => ["expected", expectedSet, 50000, n])];
      const seen = new Set();
      const inputs = [];
      for (const [name, rules, count, seed] of jobs) {
        if (inputs.length >= MIN_INPUTS * 1.3 && name === "expected" && seed > 1) break;
        const file = join(diff, `generated-${name}-${seed}.jsonl`);
        const g = await call("generate_inputs", { rules, properties: c.properties, count, seed, outFile: file });
        gens.push(g);
        const fields = new Set(g.fields ?? []);
        for (const d0 of readJsonl(file)) {
          // fill the fields no rule mentions from the fixture's base payload, then keep well-formed inputs (see cases.mjs)
          const d = { ...Object.fromEntries(Object.entries(c.base).filter(([k]) => !fields.has(k))), ...d0 };
          const k = JSON.stringify(d);
          if (seen.has(k) || !c.wellFormed(d)) continue;
          seen.add(k);
          inputs.push(d);
        }
      }
      writeFileSync(join(diff, "inputs.jsonl"), inputs.map((i) => JSON.stringify(i)).join("\n") + "\n");
      const old = runOld(c, run.pristine, join(diff, "inputs.jsonl"), join(diff, "old.jsonl"), diff);
      if (!old.ok) return { pass: false, score: 0, reason: `old validator could not run: ${old.error}` };
      const common = { inputsPath: join(diff, "inputs.jsonl"), oldResultsPath: join(diff, "old.jsonl"), minInputs: MIN_INPUTS, runner: { name: c.runner.script, sandbox: old.header } };
      // grader sanity: the input set must exercise the EXPECTED rules and agree with the old validator on them
      const exp = await call("compare_results", { rules: expectedSet, ...common });
      if (exp.verdict !== "PASS") return { pass: false, score: 0, reason: `grader input set is not usable (expected rules vs old validator: ${exp.verdict}: ${(exp.reasons ?? []).join(" ")})` };
      const res = await call("compare_results", { rules: agent.ruleSet, ...common });
      const pass = res.verdict === "PASS";
      return { pass, score: pass ? 1 : 0, reason: `${res.verdict} on ${inputs.length} inputs${pass ? "" : `: ${(res.reasons ?? []).join(" ")}`} totals=${JSON.stringify(res.totals ?? {}).slice(0, 200)}` };
    });
  } catch (e) {
    return { pass: false, score: 0, reason: `differential could not run: ${e.message}` };
  }
}
