// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { createLinkedTransports } from "../src/sdk";
import { buildServer } from "../src/server";
import { camel, generatorNames, pascal, suggestClientWiring } from "../src/wiring";

const here = dirname(fileURLToPath(import.meta.url));
const golden = resolve(here, "../../conformance/golden");

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

async function connectClient(roots: string[]) {
  const server = buildServer();
  const client = new Client({ name: "test", version: "0" }, { capabilities: { roots: {} } });
  client.setRequestHandler("roots/list", async () => ({ roots: roots.map((r) => ({ uri: pathToFileURL(r).href })) }));
  const [a, b] = createLinkedTransports();
  await server.connect(a);
  await client.connect(b);
  cleanup.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}
type Result = { isError?: boolean; structuredContent?: Record<string, any>; content: Array<{ text: string }> };
const call = async (c: Client, name: string, args: Record<string, unknown>) =>
  (await c.callTool({ name, arguments: args })) as unknown as Result;

const crd = {
  apiVersion: "apiextensions.k8s.io/v1",
  kind: "CustomResourceDefinition",
  metadata: { name: "widgets.example.test" },
  spec: {
    names: { kind: "Widget" },
    versions: [
      {
        name: "v1",
        schema: {
          openAPIV3Schema: {
            type: "object",
            properties: {
              spec: {
                type: "object",
                required: ["min", "max"],
                properties: { min: { type: "integer", format: "int32" }, max: { type: "integer", format: "int32" } },
                "x-kubernetes-validations": [
                  { rule: "self.max >= self.min", message: "max must be at least min" },
                  { rule: "self.items.all(i, i > 0)", message: "positive" },
                ],
              },
            },
          },
        },
      },
    ],
  },
};

describe("naming", () => {
  it("matches wrap()'s styles", () => {
    expect(pascal("Signup-Input")).toBe("SignupInput");
    expect(camel("Signup-Input")).toBe("signupInput");
    expect(generatorNames("Signup")).toEqual({ kubb: "signupSchema", "hey-api": "zSignup", orval: "Signup" });
  });
});

describe("read_openapi_rules generatorNames", () => {
  it("adds the export names per schema with rules", async () => {
    const c = await connectClient([golden]);
    const doc = JSON.parse(readFileSync(resolve(golden, "fastapi.openapi.json"), "utf8"));
    const r = await call(c, "read_openapi_rules", { document: doc });
    const s = r.structuredContent?.schemasWithRules.find((x: any) => x.schema === "Signup");
    expect(s.generatorNames).toEqual({ kubb: "signupSchema", "hey-api": "zSignup", orval: "Signup" });
  });
});

describe("suggest_client_wiring", () => {
  it("is deterministic", () => {
    expect(suggestClientWiring({ frontend: "react", generator: "kubb" })).toEqual(suggestClientWiring({ frontend: "react", generator: "kubb" }));
  });
  it("kubb + react: plugin config, import change, registerDeps, server errors", () => {
    const w = suggestClientWiring({ frontend: "react", generator: "kubb", schemaName: "Signup" });
    const all = w.snippets.map((s) => s.code).join("\n");
    expect(w.exportName).toBe("signupSchema");
    expect(all).toContain("pluginValidonce()");
    expect(all).toContain('from "./gen/validonce.gen"');
    expect(all).toContain("registerDeps");
    expect(all).toContain("fieldErrorsFromIssues");
  });
  it("hey-api and orval export names", () => {
    expect(suggestClientWiring({ frontend: "vue", generator: "hey-api", schemaName: "Contact" }).exportName).toBe("zContact");
    const o = suggestClientWiring({ frontend: "angular", generator: "orval", schemaName: "Contact" });
    expect(o.exportName).toBe("Contact");
    expect(o.snippets.map((s) => s.code).join("\n")).toContain("withValidonce");
  });
  it.each([
    ["react", "withRules", "registerDeps"],
    ["angular", "validonceGroupValidator", "validateStandardSchema"],
    ["vue", "watchDependents", "toVeeSchema"],
    ["dom", "attachRules", "applyServerErrors"],
  ] as const)("runtime wiring for %s", (frontend, a, b) => {
    const w = suggestClientWiring({ frontend });
    const all = w.snippets.map((s) => s.code).join("\n");
    expect(all).toContain("rulesFromOpenApi");
    expect(all).toContain(a);
    expect(all).toContain(b);
    expect(w.generator).toBeUndefined();
  });
  it("works through the server and rejects a bad frontend", async () => {
    const c = await connectClient([golden]);
    const r = await call(c, "suggest_client_wiring", { frontend: "dom" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent?.frontend).toBe("dom");
    expect((await call(c, "suggest_client_wiring", { frontend: "svelte" })).isError).toBe(true);
  });
});

describe("translate_kubernetes", () => {
  it("translates a CRD: one rule translated, one server_only with a reason", async () => {
    const c = await connectClient([golden]);
    const r = await call(c, "translate_kubernetes", { document: crd });
    expect(r.isError).toBeFalsy();
    const s = r.structuredContent!;
    expect(s.kind).toBe("crd");
    expect(s.counts.translated).toBe(1);
    expect(s.counts.server_only).toBe(1);
    expect(s.report.find((x: any) => x.outcome === "server_only").reason).toBeTruthy();
    expect(s.document.v1.properties.spec["x-validonce"].rules.length).toBe(1);
    expect(s.document.v1.properties.spec["x-kubernetes-validations"].length).toBe(2);
  });
  it("translates a Kubernetes OpenAPI document", async () => {
    const c = await connectClient([golden]);
    const doc = { openapi: "3.0.0", components: { schemas: { Widget: crd.spec.versions[0]!.schema.openAPIV3Schema } } };
    const r = await call(c, "translate_kubernetes", { document: doc });
    expect(r.structuredContent?.kind).toBe("openapi");
    expect(r.structuredContent?.counts.translated).toBe(1);
  });
  it("needs exactly one of path or document, and rejects non-documents", async () => {
    const c = await connectClient([golden]);
    expect((await call(c, "translate_kubernetes", {})).isError).toBe(true);
    expect((await call(c, "translate_kubernetes", { path: "/etc/passwd" })).isError).toBe(true);
  });
});
