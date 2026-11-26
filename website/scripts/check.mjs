// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Checks the build can't catch by itself. Run after `pnpm build`.
//   1. every docs/*.md page is in the sidebar (sidebars.ts ORDER), and nothing listed is missing
//   2. every snippet cut from the example apps is non-empty
//   3. the served llms.txt is byte-for-byte the repository's llms.txt
//   4. llms-full.txt carries every listed page

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(site, "..");
const fail = [];

const { ORDER } = await import(resolve(site, "sidebars.ts"));
const listed = Object.values(ORDER).flat();
const pages = readdirSync(resolve(repo, "docs"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.slice(0, -3));
for (const p of pages) if (!listed.includes(p)) fail.push(`docs/${p}.md is not in sidebars.ts ORDER`);
for (const p of listed) if (!pages.includes(p)) fail.push(`sidebars.ts lists ${p}, but docs/${p}.md does not exist`);

const snippets = JSON.parse(readFileSync(resolve(site, "src/generated/snippets.json"), "utf8"));
for (const [id, s] of Object.entries(snippets)) {
  if (!s.code.trim()) fail.push(`snippet ${id} (${s.file}) is empty`);
}

const served = readFileSync(resolve(site, "build/llms.txt"), "utf8");
if (served !== readFileSync(resolve(repo, "llms.txt"), "utf8")) fail.push("build/llms.txt differs from llms.txt");

const servedPrompt = readFileSync(resolve(site, "build/agent-setup/prompt.md"), "utf8");
if (servedPrompt !== readFileSync(resolve(site, "agent-setup/prompt.md"), "utf8")) fail.push("build/agent-setup/prompt.md differs from agent-setup/prompt.md");

const full = readFileSync(resolve(site, "build/llms-full.txt"), "utf8");
for (const p of listed) {
  if (!full.includes(`/docs/${p}.md`)) fail.push(`llms-full.txt is missing docs/${p}.md`);
}

if (fail.length) {
  console.error(fail.map((f) => `check: ${f}`).join("\n"));
  process.exit(1);
}
console.log(`check: ${pages.length} pages in the sidebar, ${Object.keys(snippets).length} snippets, llms.txt identical, llms-full.txt complete`);
