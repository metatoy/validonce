// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Builds the schemas.metatoy.com site (Cloudflare Pages) into dist/schemas/:
// conformance/schema/*.schema.json under their published names, plus the static files in schemas/.
// Fails if a schema's $id is not the URL it is published at, so the two can never drift apart.
//
// Usage, from the repo root:  node scripts/build-schemas.mjs [outDir]   (default dist/schemas)
// Cloudflare Pages: build command `node scripts/build-schemas.mjs`, output directory `dist/schemas`.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, process.argv[2] ?? "dist/schemas");
const BASE = "https://schemas.metatoy.com/validonce/";

/** repo file -> published name under /validonce/ */
export const PUBLISHED = {
  "conformance/schema/rule-format-v1.schema.json": "rules-v1.json",
  "conformance/schema/case.schema.json": "conformance-case-v1.json",
  "conformance/schema/regex-case.schema.json": "regex-case-v1.json",
  "conformance/schema/rules-file-v1.schema.json": "rules-file-v1.json",
  "schemas/validonce/dialect-v1.json": "dialect-v1.json",
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "schemas"), out, { recursive: true });

const problems = [];
for (const [src, name] of Object.entries(PUBLISHED)) {
  const text = readFileSync(join(root, src), "utf8");
  const id = JSON.parse(text).$id;
  if (id !== BASE + name) problems.push(`${src}: $id is ${id}, expected ${BASE + name}`);
  writeFileSync(join(out, "validonce", name), text);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`built ${Object.keys(PUBLISHED).length} schemas into ${out}`);
