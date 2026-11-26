// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
//
// Copies the shared guides of the validonce-migrate skill into the directory
// edition of the plugin (plugin/). With --check, fails if the copies differ.
// The directory edition's SKILL.md is written by hand and is not copied.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "skills/validonce-migrate");
const to = join(root, "plugin/skills/validonce-migrate");
const dirs = ["references", "assets"];
const check = process.argv.includes("--check");

const list = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".md")).sort() : []);
let drift = [];
for (const d of dirs) {
  const a = list(join(from, d));
  const b = list(join(to, d));
  if (check) {
    for (const f of new Set([...a, ...b])) {
      const pa = join(from, d, f);
      const pb = join(to, d, f);
      if (!existsSync(pa) || !existsSync(pb) || readFileSync(pa, "utf8") !== readFileSync(pb, "utf8")) drift.push(`${d}/${f}`);
    }
  } else {
    rmSync(join(to, d), { recursive: true, force: true });
    for (const f of a) cpSync(join(from, d, f), join(to, d, f));
  }
}
if (check && drift.length) {
  console.error(`plugin/ is out of date with skills/validonce-migrate: ${drift.join(", ")}\nRun: node scripts/sync-directory-plugin.mjs`);
  process.exit(1);
}
console.log(check ? "plugin/ guides match skills/validonce-migrate" : "copied guides into plugin/");
