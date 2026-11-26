// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Freeze the docs of a release:  node scripts/snapshot.mjs 0.6 v0.6.0
// Copies docs/*.md as they were at the release tag (not as they are on main) into
// versioned_docs/version-<v>/, writes its sidebar from sidebars.ts (dropping pages that did
// not exist yet), and records the tag in version-refs.json so repository links in the frozen
// pages point at that tag. Run it in the release PR (docs/releasing.md).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [version, tag] = process.argv.slice(2);
if (!version || !tag) {
  console.error("usage: node scripts/snapshot.mjs <version, e.g. 0.6> <tag, e.g. v0.6.0>");
  process.exit(2);
}
const git = (...args) => execFileSync("git", args, { cwd: resolve(site, ".."), encoding: "utf8" });

const files = git("ls-tree", "--name-only", `${tag}:docs`)
  .split("\n")
  .filter((f) => f.endsWith(".md"));
const out = resolve(site, "versioned_docs", `version-${version}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of files) writeFileSync(resolve(out, f), git("show", `${tag}:docs/${f}`));

const { default: sidebars, ORDER } = await import(resolve(site, "sidebars.ts"));
const have = new Set(files.map((f) => f.replace(/\.md$/, "")));
const listed = new Set(Object.values(ORDER).flat());
const keep = (items) =>
  items.filter((i) => typeof i !== "string" || have.has(i));
const docs = sidebars.docs
  .map((c) => ({ ...c, items: keep(c.items) }))
  .filter((c) => c.items.length > 0);
const extra = [...have].filter((id) => !listed.has(id)).sort();
if (extra.length) docs.push({ type: "category", label: "More", items: extra });
mkdirSync(resolve(site, "versioned_sidebars"), { recursive: true });
writeFileSync(
  resolve(site, "versioned_sidebars", `version-${version}-sidebars.json`),
  `${JSON.stringify({ docs }, null, 2)}\n`,
);

const versionsPath = resolve(site, "versions.json");
let versions = [];
try {
  versions = JSON.parse(readFileSync(versionsPath, "utf8"));
} catch {}
versions = [version, ...versions.filter((v) => v !== version)];
writeFileSync(versionsPath, `${JSON.stringify(versions, null, 2)}\n`);

const refsPath = resolve(site, "version-refs.json");
const refs = JSON.parse(readFileSync(refsPath, "utf8"));
refs[version] = tag;
writeFileSync(refsPath, `${JSON.stringify(refs, null, 2)}\n`);

console.log(`version ${version}: ${files.length} pages from ${tag}${extra.length ? `, unlisted: ${extra.join(", ")}` : ""}`);
