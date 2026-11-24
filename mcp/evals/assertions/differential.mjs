// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// (a) Differential: the agent's NEW validonce rules vs the ORIGINAL fixture's validator, with the same
// generate_inputs / compare_results the agent has. Hard gate: PASS with 0 divergences.
// The inputs come from the case's EXPECTED rules plus the fixture's field types (dates as format: date), unioned with
// inputs generated from the agent's own rules, so a legitimate rule variant (e.g. compare type "string") is still
// exercised with realistic values. The input set must exercise the expected rules (floor), and the agent's rules
// must pass compare_results on it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRun, readAgentRules, ruleKey } from "../lib/run.mjs";
import { withMcp } from "../lib/mcp.mjs";
import { runOld } from "../lib/oldvalidator.mjs";

const MIN_INPUTS = 10_000;
// The field a rule reports on (rule-format-v1 "Default path").
const reportPath = (r) => r.path ?? (r.kind === "required_when" ? r.field : r.kind === "compare" ? r.left?.field : r.fields?.[0]);
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
  // A case whose fields are all enums and integers has fewer distinct well-formed inputs than MIN_INPUTS; its case
  // sets minInputs to what the generator can reach (every rule must still be exercised both ways).
  const minInputs = c.minInputs ?? MIN_INPUTS;
  // VALIDONCE_DIFF_DIR lets rescore.mjs write a fresh set (generate_inputs never overwrites a file).
  const diff = join(run.runDir, process.env.VALIDONCE_DIFF_DIR ?? "diff");
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
        if (inputs.length >= minInputs * 1.3 && name === "expected" && seed > 1) break;
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
      const common = { inputsPath: join(diff, "inputs.jsonl"), oldResultsPath: join(diff, "old.jsonl"), minInputs, runner: { name: c.runner.script, sandbox: old.header } };
      // A partial migration keeps some checks hand-written. Those checks still reject inputs in the old validator, so
      // compare the agent's rules only with the old verdicts on the fields its rules report on (old-scoped.jsonl).
      const agentPaths = new Set(agent.rules.map(reportPath));
      // The scoped proof cannot see a check the agent deleted without a rule in its place. An optional rule (a check
      // that may stay field-level) the agent did not migrate must still be in the source as a hand-written check.
      const proposed = new Set(agent.rules.map((r) => ruleKey(r, { withType: false })));
      for (const r of run.expected.migrate.filter((x) => x.optional && x.keptIf)) {
        if (proposed.has(ruleKey(r, { withType: false }))) continue;
        const src = join(run.work, r.keptIf.file);
        const text = existsSync(src) ? readFileSync(src, "utf8") : "";
        if (!new RegExp(r.keptIf.marker, r.keptIf.flags ?? "").test(text))
          return { pass: false, score: 0, reason: `${r.id} was neither migrated nor kept as a hand-written check in ${r.keptIf.file}` };
      }
      // Run the MIGRATED validator (its rules plus everything it kept by hand) on the same inputs.
      const whole = join(diff, "whole");
      mkdirSync(whole, { recursive: true });
      const mig = runOld(c, run.work, join(diff, "inputs.jsonl"), join(whole, "migrated.jsonl"), whole);
      const before = readJsonl(join(diff, "old.jsonl"));
      const after = mig.ok ? readJsonl(join(whole, "migrated.jsonl")) : [];
      // Scoped proof: the agent's RULES (what browsers will enforce) against the old verdicts on the fields its rules
      // report on. Inputs where the migrated validator still fails at "__root__" are left out: a check kept by hand
      // rejects them (and a validator that stops at its first error may hide a rule's failure behind it), so they say
      // nothing about the rules. The whole-model proof below still covers them.
      const keptRoot = (i) => after[i]?.paths?.includes("__root__") ?? false;
      const keep = before.map((_, i) => !keptRoot(i));
      const scoped = before
        .map((o, i) => {
          const paths = (o.paths ?? []).filter((p) => agentPaths.has(p) || p === "__root__");
          return { ...o, accept: o.error ? o.accept : paths.length === 0, paths };
        })
        .filter((_, i) => keep[i]);
      writeFileSync(join(diff, "old-scoped.jsonl"), scoped.map((o) => JSON.stringify(o)).join("\n") + "\n");
      writeFileSync(join(diff, "inputs-scoped.jsonl"), inputs.filter((_, i) => keep[i]).map((d) => JSON.stringify(d)).join("\n") + "\n");
      const scopedMin = Math.min(minInputs, scoped.length);
      // grader sanity: the input set must exercise the EXPECTED rules and agree with the old validator on them
      const exp = await call("compare_results", { rules: expectedSet, ...common });
      if (exp.verdict !== "PASS") return { pass: false, score: 0, reason: `grader input set is not usable (expected rules vs old validator: ${exp.verdict}: ${(exp.reasons ?? []).join(" ")})` };
      const res = await call("compare_results", { rules: agent.ruleSet, ...common, inputsPath: join(diff, "inputs-scoped.jsonl"), oldResultsPath: join(diff, "old-scoped.jsonl"), minInputs: scopedMin });
      const scopedPass = res.verdict === "PASS";
      const scopedNote = `rules ${res.verdict} on ${scoped.length} inputs${scopedPass ? "" : `: ${(res.reasons ?? []).join(" ")}`} totals=${JSON.stringify(res.totals ?? {}).slice(0, 160)}`;
      // Whole-model proof: the migrated validator must accept and reject exactly what the original does on every input.
      // This catches a check deleted without a rule in its place.
      // No whole-model proof, no pass: a deleted check would go unseen.
      if (!mig.ok) return { pass: false, score: 0, reason: `${scopedNote}; whole model FAIL: the migrated validator could not run (${mig.error.slice(0, 160)})` };
      const differs = before.map((o, i) => [o, after[i], inputs[i]]).filter(([o, n]) => !n || Boolean(o.error) !== Boolean(n.error) || o.accept !== n.accept);
      const wholePass = differs.length === 0;
      const example = differs[0] ? ` (e.g. ${JSON.stringify(differs[0][2]).slice(0, 140)}: original ${differs[0][0].accept ? "accepts" : "rejects"}, migrated ${differs[0][1]?.accept ? "accepts" : "rejects"})` : "";
      const pass = scopedPass && wholePass;
      return { pass, score: pass ? 1 : 0, reason: `${scopedNote}; whole model ${wholePass ? "PASS" : "FAIL"}: ${differs.length} of ${inputs.length} inputs differ between the original and the migrated validator${example}` };
    });
  } catch (e) {
    return { pass: false, score: 0, reason: `differential could not run: ${e.message}` };
  }
}
