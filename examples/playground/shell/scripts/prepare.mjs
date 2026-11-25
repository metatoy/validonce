// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Fills what the shell needs before `vite` runs:
//   src/generated/snippets.json  the Contact rule source for each backend, cut from the real example
//                                files between `playground:begin` / `playground:end` marker comments
//   public/frames/<fw>/          the four built frames (build them first: pnpm -r --filter
//                                "validonce-playground-frame-*" build)
//   public/k8s/contact-crd.json  the Contact CRD the Kubernetes option reads
// Vite copies public/ into dist/, so one static site holds everything.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shell = resolve(here, "..");
const examples = resolve(shell, "../..");

const SOURCES = {
  aspnet: { file: "aspnet-app/Signup.cs", language: "C#" },
  fastapi: { file: "fastapi-app/app.py", language: "Python" },
  fastify: { file: "fastify-app/src/app.ts", language: "TypeScript" },
  nestjs: { file: "nestjs-app/src/app.ts", language: "TypeScript" },
  go: { file: "go-app/contact.go", language: "Go" },
  spring: {
    file: "spring-app/src/main/java/com/metatoy/validonce/example/ContactRules.java",
    language: "Java",
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
  snippets[id] = {
    language: s.language,
    file: `examples/${s.file}`,
    code: cut(resolve(examples, s.file)),
  };
}

// Kubernetes: the CEL rules, shown the way they sit in the CRD.
const crdPath = resolve(examples, "playground/k8s/contact-crd.json");
const crd = JSON.parse(readFileSync(crdPath, "utf8"));
const validations =
  crd.spec.versions[0].schema.openAPIV3Schema["x-kubernetes-validations"] ?? [];
const yaml = ["x-kubernetes-validations:"];
for (const v of validations) {
  yaml.push(`  - rule: ${JSON.stringify(v.rule)}`);
  yaml.push(`    message: ${JSON.stringify(v.message)}`);
  if (v.fieldPath) yaml.push(`    fieldPath: ${JSON.stringify(v.fieldPath)}`);
}
snippets.k8s = {
  language: "CEL",
  file: "examples/playground/k8s/contact-crd.json",
  code: yaml.join("\n"),
};

mkdirSync(resolve(shell, "src/generated"), { recursive: true });
writeFileSync(
  resolve(shell, "src/generated/snippets.json"),
  `${JSON.stringify(snippets, null, 2)}\n`,
);

// The frames and the CRD.
const pub = resolve(shell, "public");
rmSync(pub, { recursive: true, force: true });
for (const fw of ["react", "angular", "vue", "dom"]) {
  const dist = resolve(examples, "playground/frames", fw, "dist");
  if (!existsSync(resolve(dist, "index.html"))) {
    throw new Error(`frame ${fw} is not built: pnpm -r --filter "validonce-playground-frame-*" build`);
  }
  cpSync(dist, resolve(pub, "frames", fw), { recursive: true });
}
mkdirSync(resolve(pub, "k8s"), { recursive: true });
cpSync(crdPath, resolve(pub, "k8s/contact-crd.json"));
console.log("prepared snippets, frames and CRD");
