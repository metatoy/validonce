// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Golden check, step 3: the rules exported by the generated C# / Python must equal the input rules.
// usage: node compare.mjs <units.json> <csharp-export.json> <python-export.json>
import { readFileSync } from "node:fs";

const [unitsPath, csPath, pyPath] = process.argv.slice(2);
const units = JSON.parse(readFileSync(unitsPath, "utf8"));
const exported = {
  csharp: JSON.parse(readFileSync(csPath, "utf8")),
  python: JSON.parse(readFileSync(pyPath, "utf8")),
};

// Canonical form: sorted keys. Numbers are parsed, so 1.0 and 1 are equal.
const canon = (v) =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
      : v;
// C# omits `message.params` when it is empty; that is the one cosmetic difference accepted.
const dropEmptyParams = (r) => {
  if (r.message && r.message.params && Object.keys(r.message.params).length === 0) {
    const { params, ...rest } = r.message;
    return { ...r, message: rest };
  }
  return r;
};

const rules = { csharp: 0, python: 0 };
let bad = 0;
const notExpressible = [];
for (const lang of ["csharp", "python"]) {
  for (const u of units) {
    const skip = new Map(u[lang].unexpressible.map((x) => [x.ruleId, x.reason]));
    const want = u.rules.rules.filter((r) => !skip.has(r.id));
    for (const [id, reason] of skip) notExpressible.push(`${lang} ${u.name} (${u.source}) ${id}: ${reason}`);
    const got = exported[lang][u.name];
    if (!got) {
      console.log(`MISSING ${lang} ${u.name}`);
      bad++;
      continue;
    }
    const norm = (rs) => JSON.stringify(canon(rs.map(lang === "csharp" ? dropEmptyParams : (x) => x)));
    const a = norm(want);
    const b = norm(got.rules);
    if (a !== b) {
      bad++;
      console.log(`MISMATCH ${lang} ${u.name} (${u.source})\n  want ${a}\n  got  ${b}`);
    } else rules[lang] += want.length;
  }
}
const total = units.reduce((a, u) => a + u.rules.rules.length, 0);
console.log(`units: ${units.length}; input rules: ${total}; round-tripped: C# ${rules.csharp}, Python ${rules.python}; mismatches: ${bad}`);
console.log(`rules not expressible through the builders: ${notExpressible.length}`);
for (const l of notExpressible) console.log("  - " + l);
process.exit(bad === 0 ? 0 : 1);
