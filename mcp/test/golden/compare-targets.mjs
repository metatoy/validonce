// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Golden check for the go, java, typescript-rules, vue and dom targets, last step: the rules exported by
// the generated code must equal the input rules.
// usage: node compare-targets.mjs <units.json> <go-export.json> <java-export.json> <ts-export.json>
import { readFileSync } from "node:fs";

const [unitsPath, goPath, javaPath, tsPath] = process.argv.slice(2);
const units = JSON.parse(readFileSync(unitsPath, "utf8"));
const ts = JSON.parse(readFileSync(tsPath, "utf8"));
const exported = {
  go: JSON.parse(readFileSync(goPath, "utf8")),
  java: JSON.parse(readFileSync(javaPath, "utf8")),
};
for (const v of ["fastify", "nestjs", "vue", "dom"]) {
  exported[v] = Object.fromEntries(units.map((u) => [u.name, ts[`${v}/${u.name}`]]));
}

const canon = (v) =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
      : v;
// An empty message.params is the one cosmetic difference accepted (some builders omit it).
const dropEmptyParams = (r) => {
  if (r.message && r.message.params && Object.keys(r.message.params).length === 0) {
    const { params, ...rest } = r.message;
    return { ...r, message: rest };
  }
  return r;
};

const targets = ["go", "java", "fastify", "nestjs", "vue", "dom"];
const counts = Object.fromEntries(targets.map((t) => [t, 0]));
let bad = 0;
const notExpressible = [];
for (const t of targets) {
  for (const u of units) {
    const skip = new Map(u.unexpressible[t].map((x) => [x.ruleId, x.reason]));
    const want = u.rules.rules.filter((r) => !skip.has(r.id));
    for (const [id, reason] of skip) notExpressible.push(`${t} ${u.name} (${u.source}) ${id}: ${reason}`);
    const got = exported[t][u.name];
    if (!got) {
      console.log(`MISSING ${t} ${u.name}`);
      bad++;
      continue;
    }
    const norm = (rs) => JSON.stringify(canon(rs.map(dropEmptyParams)));
    const a = norm(want);
    const b = norm(got.rules);
    if (a !== b) {
      bad++;
      console.log(`MISMATCH ${t} ${u.name} (${u.source})\n  want ${a}\n  got  ${b}`);
    } else counts[t] += want.length;
  }
}
const total = units.reduce((a, u) => a + u.rules.rules.length, 0);
console.log(`units: ${units.length}; input rules per target: ${total}; round-tripped: ${targets.map((t) => `${t} ${counts[t]}`).join(", ")}; mismatches: ${bad}`);
console.log(`rules not expressible through the builders: ${notExpressible.length}`);
for (const l of notExpressible) console.log("  - " + l);
process.exit(bad === 0 ? 0 : 1);
