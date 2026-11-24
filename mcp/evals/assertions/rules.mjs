// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// (b) Rule recall and precision against expected.json, on semantics: kind, fields, left/right, op, when (and a non-default
// path). Ignored: id and message (key/params). A different compare.type (for example "string" instead of "date" because
// the old validator accepts dates the format rejects) is not a miss; it is counted as type_variants and noted. Whether the
// variant is right is the differential assertion's job.
import { loadRun, readAgentRules, ruleKey } from "../lib/run.mjs";

export default function (_output, context) {
  const run = loadRun(context);
  const a = readAgentRules(run.work);
  if (a.error) return { pass: false, score: 0, reason: a.error, namedScores: { recall: 0, precision: 0, type_variants: 0 } };
  const sem = (r) => ruleKey(r, { withType: false });
  // "optional": true marks a rule that may be migrated or kept as a field-level check (e.g. a single-field minimum):
  // it does not count toward recall, and proposing it does not lower precision.
  const optional = new Map(run.expected.migrate.filter((r) => r.optional).map((r) => [sem(r), ruleKey(r)]));
  const wantBySem = new Map(run.expected.migrate.filter((r) => !r.optional).map((r) => [sem(r), ruleKey(r)]));
  const got = a.rules.map((r) => ({ s: sem(r), t: ruleKey(r) }));
  const hit = new Set(got.filter((g) => wantBySem.has(g.s)).map((g) => g.s));
  const recall = wantBySem.size ? hit.size / wantBySem.size : 1;
  const counted = got.filter((g) => !optional.has(g.s));
  const precision = counted.length ? counted.filter((g) => wantBySem.has(g.s)).length / counted.length : 1;
  const variants = got.filter((g) => wantBySem.has(g.s) && wantBySem.get(g.s) !== g.t).length;
  const pass = recall === 1 && precision === 1 && new Set(got.map((g) => g.s)).size === got.length;
  return {
    pass, score: (recall + precision) / 2,
    reason: `recall=${recall.toFixed(2)} (${hit.size}/${wantBySem.size}) precision=${precision.toFixed(2)} (${got.length} proposed${optional.size ? `, ${got.length - counted.length} optional` : ""})${variants ? `; note: ${variants} compare type variant(s) differ from expected (judged by the differential)` : ""}`,
    namedScores: { recall, precision, type_variants: variants },
  };
}
