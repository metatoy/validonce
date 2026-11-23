// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// (a) Differential: the agent's NEW validonce rules vs the ORIGINAL fixture's validator, with the same
// generate_inputs / compare_results the agent has. Hard gate: PASS with 0 divergences.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRun, readAgentRules } from "../lib/run.mjs";
import { withMcp } from "../lib/mcp.mjs";
import { runOld } from "../lib/oldvalidator.mjs";

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
  try {
    return await withMcp([diff], async (call) => {
      const gen = await call("generate_inputs", { rules: agent.ruleSet, count: 30000, seed: 1, outFile: join(diff, "generated.jsonl") });
      const fields = new Set(gen.fields ?? []);
      // fill the fields no rule mentions from the fixture's base payload, then keep well-formed inputs (see cases.mjs)
      const inputs = readFileSync(join(diff, "generated.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
        .map((d) => ({ ...Object.fromEntries(Object.entries(c.base).filter(([k]) => !fields.has(k))), ...d }))
        .filter(c.wellFormed);
      writeFileSync(join(diff, "inputs.jsonl"), inputs.map((i) => JSON.stringify(i)).join("\n") + "\n");
      const old = runOld(c, run.pristine, join(diff, "inputs.jsonl"), join(diff, "old.jsonl"), diff);
      if (!old.ok) return { pass: false, score: 0, reason: `old validator could not run: ${old.error}` };
      const res = await call("compare_results", {
        rules: agent.ruleSet, inputsPath: join(diff, "inputs.jsonl"), oldResultsPath: join(diff, "old.jsonl"),
        minInputs: 1000, runner: { name: c.runner.script, sandbox: old.header },
      });
      const pass = res.verdict === "PASS";
      return { pass, score: pass ? 1 : 0, reason: `${res.verdict} on ${inputs.length} inputs${pass ? "" : `: ${(res.reasons ?? []).join(" ")}`} totals=${JSON.stringify(res.totals ?? {}).slice(0, 200)}` };
    });
  } catch (e) {
    return { pass: false, score: 0, reason: `differential could not run: ${e.message}` };
  }
}
