// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Fills what the site needs before `docusaurus` runs (all outputs are git-ignored):
//   static/assets/              the repository's assets/ (the docs' ../assets/ images point here)
//   static/llms.txt             a copy of the repository's llms.txt (scripts/check.mjs keeps them equal)
//   static/llms-full.txt        every current docs page as plain Markdown, in sidebar order
//   src/generated/snippets.json the Contact rules for each backend, cut from the real example files
//                               between `playground:begin` / `playground:end` marker comments (the
//                               same markers the playground uses), so the docs can't drift from the code

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(site, "..");

// 1. Assets.
const assets = resolve(site, "static/assets");
rmSync(assets, { recursive: true, force: true });
for (const dir of ["diagram", "brand"]) {
  cpSync(resolve(repo, "assets", dir), resolve(assets, dir), { recursive: true });
}

// 2. llms.txt and llms-full.txt.
cpSync(resolve(repo, "llms.txt"), resolve(site, "static/llms.txt"));
const { ORDER } = await import(resolve(site, "sidebars.ts"));
const parts = [
  "# validonce: full documentation",
  "",
  "> Every page of the current docs (https://validonce.metatoy.com/docs/next) as plain Markdown, in reading order. Generated from the repository's docs/ folder at build time.",
];
for (const id of Object.values(ORDER).flat()) {
  const text = readFileSync(resolve(repo, "docs", `${id}.md`), "utf8").trim();
  parts.push("", "---", "", `Source: https://github.com/metatoy/validonce/blob/main/docs/${id}.md`, "", text);
}
writeFileSync(resolve(site, "static/llms-full.txt"), `${parts.join("\n")}\n`);

// 3. Snippets.
export const SOURCES = {
  aspnet: { label: "ASP.NET Core", file: "examples/aspnet-app/Signup.cs", language: "csharp" },
  fastapi: { label: "FastAPI", file: "examples/fastapi-app/app.py", language: "python" },
  fastify: { label: "Fastify", file: "examples/fastify-app/src/app.ts", language: "ts" },
  nestjs: { label: "NestJS", file: "examples/nestjs-app/src/app.ts", language: "ts" },
  go: { label: "Go", file: "examples/go-app/contact.go", language: "go" },
  spring: {
    label: "Spring Boot",
    file: "examples/spring-app/src/main/java/com/metatoy/validonce/example/ContactRules.java",
    language: "java",
  },
};

const BEGIN = /^\s*(?:\/\/|#)\s*playground:begin\s*$/;
const END = /^\s*(?:\/\/|#)\s*playground:end\s*$/;

function cut(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  const start = lines.findIndex((l) => BEGIN.test(l));
  const end = lines.findIndex((l, i) => i > start && END.test(l));
  if (start < 0 || end < 0) throw new Error(`${path}: no playground:begin/end markers`);
  const body = lines.slice(start + 1, end);
  const indent = Math.min(
    ...body.filter((l) => l.trim()).map((l) => (l.match(/^\s*/) ?? [""])[0].length),
  );
  return body.map((l) => l.slice(indent)).join("\n");
}

const snippets = {};
for (const [id, s] of Object.entries(SOURCES)) {
  snippets[id] = { ...s, code: cut(resolve(repo, s.file)) };
}
mkdirSync(resolve(site, "src/generated"), { recursive: true });
writeFileSync(resolve(site, "src/generated/snippets.json"), `${JSON.stringify(snippets, null, 2)}\n`);

console.log(`prepare: assets, llms.txt, llms-full.txt (${Object.values(ORDER).flat().length} pages), ${Object.keys(snippets).length} snippets`);

// 4. The Contact rules as the backends export them (conformance/golden/, checked identical across
// all six by scripts/check_golden.py), for the live examples.
const golden = JSON.parse(readFileSync(resolve(repo, "conformance/golden/fastapi.openapi.json"), "utf8"));
const contact = golden.components?.schemas?.Contact?.["x-validonce"];
if (!contact) throw new Error("conformance/golden/fastapi.openapi.json: no Contact x-validonce");
writeFileSync(resolve(site, "src/generated/contact-rules.json"), `${JSON.stringify(contact, null, 2)}\n`);
