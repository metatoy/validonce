// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { createLinkedTransports } from "../src/sdk";
import { buildServer } from "../src/server";

const here = dirname(fileURLToPath(import.meta.url));
const golden = resolve(here, "../../conformance/golden");

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

async function connectClient(roots: string[]) {
  const server = buildServer();
  const client = new Client(
    { name: "test", version: "0" },
    { capabilities: { roots: {} } },
  );
  client.setRequestHandler("roots/list", async () => ({
    roots: roots.map((r) => ({ uri: pathToFileURL(r).href })),
  }));
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

describe("validonce-mcp", () => {
  it("lists the read-only tools", async () => {
    const c = await connectClient([golden]);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["check_rules", "compare_results", "evaluate", "generate_code", "generate_inputs", "read_openapi_rules"]);
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(t.name !== "generate_inputs");
  });

  it("generate_code returns builder source for the Signup rules", async () => {
    const c = await connectClient([golden]);
    const doc = JSON.parse(readFileSync(resolve(golden, "fastapi.openapi.json"), "utf8"));
    const r = await call(c, "generate_code", { rules: doc.components.schemas.Signup["x-validonce"], target: "csharp", modelName: "Signup", document: doc, schemaName: "Signup" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent?.complete).toBe(true);
    expect(r.structuredContent?.source).toContain("RequiredWhen(x => x.Company");
  });

  for (const file of ["aspnet.openapi.json", "fastapi.openapi.json"]) {
    it(`reads rules from ${file}`, async () => {
      const c = await connectClient([golden]);
      const r = await call(c, "read_openapi_rules", { path: resolve(golden, file) });
      expect(r.isError).toBeFalsy();
      const withRules = r.structuredContent?.schemasWithRules;
      expect(withRules.length).toBeGreaterThan(0);
      expect(withRules[0].rules.length).toBe(withRules[0].ruleCount);
      expect(r.structuredContent?.errors).toEqual([]);
    });
  }

  it("check_rules passes golden rules against their own properties", async () => {
    const c = await connectClient([golden]);
    const doc = JSON.parse(readFileSync(resolve(golden, "aspnet.openapi.json"), "utf8"));
    const r = await call(c, "check_rules", {
      rules: doc.components.schemas.Signup["x-validonce"],
      document: doc,
      schemaName: "Signup",
    });
    expect(r.structuredContent?.problems).toEqual([]);
    expect(r.structuredContent?.ok).toBe(true);
    expect(r.structuredContent?.fieldsChecked).toBe(true);
  });

  it("check_rules reports unknown fields, type mismatch and duplicate ids", async () => {
    const c = await connectClient([golden]);
    const msg = { key: "k" };
    const r = await call(c, "check_rules", {
      rules: {
        version: 1,
        rules: [
          { id: "a", kind: "at_least_one_of", fields: ["x", "nope"], message: msg },
          { id: "a", kind: "compare", left: { field: "x" }, op: "lt", right: { value: 5 }, type: "date", message: msg },
        ],
      },
      properties: { x: { type: "integer" }, y: { type: "string" } },
    });
    const codes = r.structuredContent?.problems.map((p: { code: string }) => p.code).sort();
    expect(codes).toEqual(["duplicate_id", "type_mismatch", "unknown_field"]);
    expect(r.structuredContent?.ok).toBe(false);
  });

  it("check_rules reports malformed rules instead of throwing", async () => {
    const c = await connectClient([golden]);
    const r = await call(c, "check_rules", { rules: { version: 1, rules: [{ id: "a", kind: "bogus" }] } });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent?.ok).toBe(false);
    expect(r.structuredContent?.problems[0].code).toBe("invalid_rule_set");
  });

  it("evaluate returns issues per payload and honours side", async () => {
    const c = await connectClient([golden]);
    const rules = {
      version: 1,
      rules: [
        { id: "r1", kind: "required_when", field: "company", when: { eq: { field: "plan", value: "pro" } }, message: { key: "m1" } },
        { id: "r2", kind: "at_least_one_of", fields: ["a", "b"], server_only: true, message: { key: "m2" } },
      ],
    };
    const payloads = [{ plan: "pro" }, { plan: "free", a: 1 }];
    const s = await call(c, "evaluate", { rules, payloads });
    expect(s.structuredContent?.results[0].issues.map((i: { ruleId: string }) => i.ruleId)).toEqual(["r1", "r2"]);
    expect(s.structuredContent?.results[1].valid).toBe(true);
    const cl = await call(c, "evaluate", { rules, payloads, side: "client" });
    expect(cl.structuredContent?.results[0].issues.map((i: { ruleId: string }) => i.ruleId)).toEqual(["r1"]);
  });

  it("evaluate reports an invalid rule set as a tool error", async () => {
    const c = await connectClient([golden]);
    const r = await call(c, "evaluate", { rules: { version: 2, rules: [] }, payloads: [{}] });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("Invalid rule set");
  });

  it("rejects a path outside the roots", async () => {
    const c = await connectClient([golden]);
    const r = await call(c, "read_openapi_rules", { path: "/etc/hosts" });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("outside the allowed roots");
    const dotdot = await call(c, "read_openapi_rules", { path: resolve(golden, "../schema/rule-format-v1.schema.json") });
    expect(dotdot.isError).toBe(true);
  });

  it("accepts a document object and requires exactly one input", async () => {
    const c = await connectClient([golden]);
    const doc = JSON.parse(readFileSync(resolve(golden, "fastapi.openapi.json"), "utf8"));
    const ok = await call(c, "read_openapi_rules", { document: doc });
    expect(ok.structuredContent?.schemasWithRules.length).toBeGreaterThan(0);
    const bad = await call(c, "read_openapi_rules", {});
    expect(bad.isError).toBe(true);
  });
});
