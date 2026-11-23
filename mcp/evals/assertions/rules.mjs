// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// (b) Rule recall and precision against expected.json (ids and messages ignored). Both must be 1.
import { loadRun, readAgentRules, ruleKey } from "../lib/run.mjs";

export default function (_output, context) {
  const run = loadRun(context);
  const a = readAgentRules(run.work);
  if (a.error) return { pass: false, score: 0, reason: a.error, namedScores: { recall: 0, precision: 0 } };
  const want = new Set(run.expected.migrate.map(ruleKey));
  const got = a.rules.map(ruleKey);
  const hit = new Set(got.filter((k) => want.has(k)));
  const recall = want.size ? hit.size / want.size : 1;
  const precision = got.length ? got.filter((k) => want.has(k)).length / got.length : 1;
  const pass = recall === 1 && precision === 1 && new Set(got).size === got.length;
  return { pass, score: (recall + precision) / 2, reason: `recall=${recall.toFixed(2)} (${hit.size}/${want.size}) precision=${precision.toFixed(2)} (${got.length} proposed)`, namedScores: { recall, precision } };
}
