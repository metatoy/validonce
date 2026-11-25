// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Golden check for the go, java, typescript-rules, vue and dom targets, step 1: generate every
// target for the Signup and Contact contracts and every distinct rule set in conformance/rules/*.json.
// Writes sources under golden/out-targets/ plus units.json (the expected rules). Run by run-targets.sh.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generateCode, type CodegenInput } from "../../src/codegen";

const here = process.cwd(); // run-targets.sh runs from this directory
const root = resolve(here, "../../..");
const out = resolve(here, "out-targets");
rmSync(out, { recursive: true, force: true });

const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const write = (rel: string, text: string) => {
  const p = resolve(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
};

interface Unit {
  name: string;
  source: string;
  rules: { version: 1; rules: unknown[] };
  properties?: Record<string, unknown>;
}
const units: Unit[] = [];
const signup = read("conformance/golden/fastapi.openapi.json").components.schemas.Signup;
units.push({ name: "Signup", source: "conformance/golden/fastapi.openapi.json", rules: signup["x-validonce"], properties: signup.properties });
const contact = read("conformance/golden/go.openapi.json").components.schemas.Contact;
units.push({ name: "Contact", source: "conformance/golden/go.openapi.json (CONTRACT.md)", rules: contact["x-validonce"], properties: contact.properties });

const seen = new Set<string>();
let n = 0;
for (const f of readdirSync(resolve(root, "conformance/rules")).filter((x) => x.endsWith(".json")).sort()) {
  for (const c of read(`conformance/rules/${f}`).cases) {
    const rules = { version: 1 as const, rules: c.rules };
    const key = JSON.stringify(rules);
    if (seen.has(key)) continue;
    seen.add(key);
    n += 1;
    units.push({ name: `U${String(n).padStart(3, "0")}`, source: `${f}#${c.id}`, rules });
  }
}

// Variant -> how to generate it. Every variant exports `rules` (or a Go / Java equivalent).
const variants: Array<{ id: string; input: Partial<CodegenInput> }> = [
  { id: "go", input: { target: "go", namespace: "main" } },
  { id: "java", input: { target: "java", namespace: "golden" } },
  { id: "fastify", input: { target: "typescript-rules", framework: "fastify" } },
  { id: "nestjs", input: { target: "typescript-rules", framework: "nestjs" } },
  { id: "vue", input: { target: "vue", includeModel: true } },
  { id: "dom", input: { target: "dom" } },
];

const unexpressible: Record<string, Record<string, Array<{ ruleId: string; reason: string }>>> = {};
const tsEntries: string[] = [];
const javaNames: string[] = [];
const goNames: string[] = [];
for (const u of units) {
  for (const v of variants) {
    const r = generateCode({ rules: u.rules, modelName: u.name, properties: u.properties, ...v.input } as CodegenInput);
    (unexpressible[v.id] ??= {})[u.name] = r.unexpressible;
    for (const f of r.files ?? []) {
      if (v.id === "go") write(`go/${u.name.toLowerCase()}.go`, f.source);
      else if (v.id === "java") write(`java/golden/${f.path}`, f.source);
      else write(`ts/${v.id}/${f.path}`, f.source);
    }
    if (v.id === "go") goNames.push(u.name);
    else if (v.id === "java") javaNames.push(u.name);
    else {
      const primary = r.files![0]!.path.replace(/\.ts$/, "");
      tsEntries.push(`import { rules as r_${v.id}_${u.name} } from "./${v.id}/${primary}";`);
      tsEntries.push(`all[${JSON.stringify(`${v.id}/${u.name}`)}] = r_${v.id}_${u.name};`);
    }
    // A Vue single-file component and its markup are compiled too, and the DOM markup is written for a look.
  }
}

// Go: a main that prints every rule set. go.mod points at the repo's go/ module.
write("go/go.mod", `module golden\n\ngo 1.26\n\nrequire github.com/metatoy/validonce/go v0.0.0\n\nreplace github.com/metatoy/validonce/go => ${resolve(root, "go")}\n`);
write(
  "go/main.go",
  `package main

import (
	"encoding/json"
	"os"

	validonce "github.com/metatoy/validonce/go"
)

func main() {
	all := map[string]*validonce.Rules{
${goNames.map((x) => `\t\t"${x}": ${x}Rules,`).join("\n")}
	}
	out := map[string]any{}
	for k, r := range all {
		out[k] = r.Set()
	}
	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(out); err != nil {
		panic(err)
	}
}
`,
);

// Java: a main that prints every rule set (run by Gradle from the codegen-golden project).
write(
  "java/golden/Export.java",
  `package golden;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;

public final class Export {
    public static void main(String[] args) throws Exception {
        ObjectMapper m = new ObjectMapper();
        ObjectNode all = m.createObjectNode();
${javaNames.map((x) => `        all.set("${x}", new ${x}Rules().rules().toJson());`).join("\n")}
        Files.writeString(Path.of(args[0]), m.writeValueAsString(all));
    }
}
`,
);

// TypeScript: one entry that imports `rules` from every generated module and prints them.
write("ts/export-entry.ts", `import "reflect-metadata";\nconst all: Record<string, unknown> = {};\n${tsEntries.join("\n")}\nconsole.log(JSON.stringify(all));\n`);
// esbuild needs this to compile the NestJS DTO decorators.
write("ts/tsconfig.json", JSON.stringify({ compilerOptions: { experimentalDecorators: true, target: "ES2022", useDefineForClassFields: false } }));

const toCompare = units.map((u) => ({ ...u, unexpressible: Object.fromEntries(variants.map((v) => [v.id, unexpressible[v.id]![u.name]!])) }));
write("units.json", JSON.stringify(toCompare, null, 2));
console.log(`generated ${units.length} units x ${variants.length} targets (${units.reduce((a, u) => a + u.rules.rules.length, 0)} rules each)`);
