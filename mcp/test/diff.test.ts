// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { createLinkedTransports } from "../src/sdk";
import { buildServer } from "../src/server";

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(resolve(here, "../../conformance/golden/aspnet.openapi.json"), "utf8"));
const signup = doc.components.schemas.Signup;
const rules = signup["x-validonce"];
const properties = signup.properties;

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

const root = mkdtempSync(join(tmpdir(), "validonce-diff-"));

async function connectClient(roots: string[] = [root]) {
  const server = buildServer();
  const client = new Client({ name: "test", version: "0" }, { capabilities: { roots: {} } });
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

// ---- hand-written "old validators" ----
type Old = (i: Record<string, any>) => { accept: boolean; paths: string[] };
const blank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const validDate = (v: unknown) => {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(0);
  d.setUTCFullYear(+m[1]!, +m[2]! - 1, +m[3]!);
  return d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]! && +m[1]! >= 1;
};
function makeOld(o: { gt?: boolean; emptyIsPresent?: boolean } = {}): Old {
  return (i) => {
    const paths: string[] = [];
    const companyBlank = o.emptyIsPresent ? i.company === undefined || i.company === null : blank(i.company);
    if (i.plan === "pro" && companyBlank) paths.push("company");
    if (!blank(i.start) && !blank(i.end) && validDate(i.start) && validDate(i.end)) {
      const ok = o.gt ? i.end > i.start : i.end >= i.start;
      if (!ok) paths.push("end");
    }
    if (!blank(i.quantity) && typeof i.quantity === "number" && Number.isFinite(i.quantity) && !(i.quantity >= 1)) paths.push("quantity");
    return { accept: paths.length === 0, paths };
  };
}

async function generateToFile(c: Client, name: string, seed = 1, count = 10000) {
  const out = join(root, name);
  const g = await call(c, "generate_inputs", { rules, properties, seed, count, outFile: out });
  expect(g.isError).toBeFalsy();
  const inputs = readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { out, inputs, g: g.structuredContent! };
}

async function runDiff(c: Client, old: Old, name: string, extraRules?: unknown, extra: Record<string, unknown> = {}) {
  const { out, inputs } = await generateToFile(c, `${name}.jsonl`);
  const results = inputs.map((i) => {
    try {
      return old(i);
    } catch (e) {
      return { accept: false, paths: [], error: String(e) };
    }
  });
  const oldFile = join(root, `${name}.old.jsonl`);
  writeFileSync(oldFile, results.map((r) => JSON.stringify(r)).join("\n"));
  const r = await call(c, "compare_results", { rules: extraRules ?? rules, inputsPath: out, oldResultsPath: oldFile, ...extra });
  expect(r.isError).toBeFalsy();
  return r.structuredContent!;
}

describe("generate_inputs", () => {
  it("is deterministic for a seed, differs across seeds, and reports sizes", async () => {
    const c = await connectClient();
    const a = await call(c, "generate_inputs", { rules, properties, seed: 7, count: 20 });
    const b = await call(c, "generate_inputs", { rules, properties, seed: 7, count: 20 });
    const d = await call(c, "generate_inputs", { rules, properties, seed: 8, count: 20 });
    expect(a.structuredContent?.jsonl).toBe(b.structuredContent?.jsonl);
    expect(a.structuredContent?.sha256).toBe(b.structuredContent?.sha256);
    expect(a.structuredContent?.jsonl).not.toBe(d.structuredContent?.jsonl);
    expect(a.structuredContent?.randomCount).toBe(20);
    expect(a.structuredContent?.matrixSize).toBeGreaterThan(30);
    expect(a.structuredContent?.total).toBe(a.structuredContent?.matrixSize + a.structuredContent?.seedCount + 20);
  });

  it("is deterministic for 10000 inputs written to a file, and refuses to overwrite", async () => {
    const c = await connectClient();
    const x = await generateToFile(c, "det1.jsonl", 3);
    const y = await generateToFile(c, "det2.jsonl", 3);
    expect(readFileSync(x.out, "utf8")).toBe(readFileSync(y.out, "utf8"));
    expect(x.g.randomCount).toBe(10000);
    const again = await call(c, "generate_inputs", { rules, properties, count: 1, outFile: x.out });
    expect(again.isError).toBe(true);
  });

  it("covers the blank matrix, near-blanks, boundaries and near misses", async () => {
    const c = await connectClient();
    const { inputs } = await generateToFile(c, "cov.jsonl");
    const has = (f: (i: any) => boolean) => inputs.some(f);
    for (const blankValue of [null, ""]) expect(has((i) => i.plan === "pro" && JSON.stringify(i.company) === JSON.stringify(blankValue))).toBe(true);
    // company is string|null: [] and {} are field-level type errors, so they are not generated by default
    expect(has((i) => Array.isArray(i.company) || (i.company !== null && typeof i.company === "object"))).toBe(false);
    expect(has((i) => i.plan === "pro" && !("company" in i))).toBe(true);
    expect(has((i) => i.plan === "pro" && i.company === " ")).toBe(true);
    expect(has((i) => i.quantity === 0)).toBe(true);
    expect(has((i) => i.quantity === 1)).toBe(true);
    expect(has((i) => i.start && i.start === i.end)).toBe(true);
    expect(has((i) => i.plan === "Pro" || i.plan === "PRO" || i.plan === "pro ")).toBe(true);
    const dayAfter = inputs.some((i) => i.start && i.end && new Date(i.end).getTime() - new Date(i.start).getTime() === 86_400_000);
    const dayBefore = inputs.some((i) => i.start && i.end && new Date(i.end).getTime() - new Date(i.start).getTime() === -86_400_000);
    expect(dayAfter && dayBefore).toBe(true);
  });

  it("keeps every input well typed for the properties unless includeInvalid is set", async () => {
    const c = await connectClient();
    const { inputs } = await generateToFile(c, "typed.jsonl", 3, 5000);
    const fits = (k: string, v: unknown) => {
      const p = (properties as Record<string, { type?: string | string[]; format?: string }>)[k];
      if (!p) return true;
      const ts = Array.isArray(p.type) ? p.type : [p.type];
      if (v === null) return ts.includes("null");
      if (typeof v === "string") return ts.includes("string") && !(p.format === "date" && v.trim() === "");
      if (typeof v === "number") return ts.includes("number") || (ts.includes("integer") && Number.isInteger(v));
      if (typeof v === "boolean") return ts.includes("boolean");
      return ts.includes(Array.isArray(v) ? "array" : "object");
    };
    expect(inputs.every((i) => Object.entries(i).every(([k, v]) => fits(k, v)))).toBe(true);
    const g = await call(c, "generate_inputs", { rules, properties, seed: 3, count: 5000, includeInvalid: true, outFile: join(root, "untyped.jsonl") });
    const loose = readFileSync(g.structuredContent!.outFile as string, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(loose.some((i) => Array.isArray(i.company))).toBe(true);
  });

  it("never leaves a required field missing, unless includeInvalid is set", async () => {
    const c = await connectClient();
    const req = ["start", "plan"];
    const g = await call(c, "generate_inputs", { rules, properties, required: req, seed: 4, count: 3000, outFile: join(root, "req.jsonl") });
    const lines = readFileSync(g.structuredContent!.outFile as string, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.length).toBeGreaterThan(1000);
    expect(lines.every((i) => "start" in i && "plan" in i)).toBe(true);
    const g2 = await call(c, "generate_inputs", { rules, properties, required: req, seed: 4, count: 3000, includeInvalid: true, outFile: join(root, "req-loose.jsonl") });
    const loose = readFileSync(g2.structuredContent!.outFile as string, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(loose.some((i) => !("start" in i))).toBe(true);
  });

  it("couples datetimes across offsets and fraction digits", async () => {
    const c = await connectClient();
    const dt = { version: 1, rules: [{ id: "T.compare.b", kind: "compare", left: { field: "b" }, op: "ge", right: { field: "a" }, type: "datetime", message: { key: "k" } }] };
    const g = await call(c, "generate_inputs", { rules: dt, properties: { a: { type: "string", format: "date-time" }, b: { type: "string", format: "date-time" } }, count: 3000, outFile: join(root, "dt.jsonl") });
    const lines = readFileSync(g.structuredContent!.outFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const same = lines.filter((i) => i.a && i.b && Date.parse(i.a) === Date.parse(i.b) && i.a !== i.b);
    expect(same.length).toBeGreaterThan(0);
    expect(lines.some((i) => /\+00:00$/.test(i.a ?? "")) && lines.some((i) => /Z$/.test(i.b ?? ""))).toBe(true);
  });

  it("rejects a count above the cap, an outFile outside the roots, and symlink escapes", async () => {
    const c = await connectClient();
    expect((await call(c, "generate_inputs", { rules, count: 50001 })).isError).toBe(true);
    const outside = mkdtempSync(join(tmpdir(), "validonce-outside-"));
    expect((await call(c, "generate_inputs", { rules, count: 1, outFile: join(outside, "x.jsonl") })).isError).toBe(true);
    symlinkSync(outside, join(root, "link"));
    expect((await call(c, "generate_inputs", { rules, count: 1, outFile: join(root, "link", "x.jsonl") })).isError).toBe(true);
    mkdirSync(join(root, "sub"));
    expect((await call(c, "generate_inputs", { rules, count: 1, outFile: join(root, "sub", "x.txt") })).isError).toBe(true);
  });

  it("returns an error asking for outFile when the set is too big to inline", async () => {
    const c = await connectClient();
    const r = await call(c, "generate_inputs", { rules, properties, count: 5000 });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("outFile");
  });
});

describe("compare_results", () => {
  it("PASSes a correct migration", async () => {
    const c = await connectClient();
    const r = await runDiff(c, makeOld(), "ok");
    expect(r.reasons).toEqual([]);
    expect(r.verdict).toBe("PASS");
    expect(r.totals.divergences).toBe(0);
    expect(r.coverage.every((x: any) => x.exercised)).toBe(true);
    expect(r.report).toContain("**Verdict: PASS**");
  });

  it("FAILs gt-instead-of-ge with a counterexample on the boundary", async () => {
    const c = await connectClient();
    const r = await runDiff(c, makeOld({ gt: true }), "gt");
    expect(r.verdict).toBe("FAIL");
    expect(r.totals.divergences).toBeGreaterThan(0);
    const first = r.counterexamples[0];
    expect(first.ruleIds).toEqual(["Signup.compare.end"]);
    expect(first.input.start).toBe(first.input.end); // the boundary: equal dates
    expect(Object.keys(first.input).sort()).toEqual(["end", "start"]); // minimal
    expect(first.old.accept).toBe(false);
    expect(first.new.accept).toBe(true);
    expect(r.divergenceSummary.keysInEveryDivergence.sort()).toEqual(["end", "start"]);
    expect(r.report).toContain("Divergences (smallest first)");
  });

  it("FAILs when \"\" is treated as present", async () => {
    const c = await connectClient();
    const r = await runDiff(c, makeOld({ emptyIsPresent: true }), "empty");
    expect(r.verdict).toBe("FAIL");
    const first = r.counterexamples[0];
    expect(first.ruleIds).toEqual(["Signup.required_when.company"]);
    expect(first.input.plan).toBe("pro");
    expect([null, "", []].some((b) => JSON.stringify(b) === JSON.stringify(first.input.company))).toBe(true);
    expect(["", []].some((b) => JSON.stringify(b) === JSON.stringify(first.input.company))).toBe(true);
  });

  it("FAILs a rule that never fires as not exercised", async () => {
    const c = await connectClient();
    const never = {
      version: 1,
      rules: [
        ...rules.rules,
        {
          id: "Signup.required_when.never",
          kind: "required_when",
          field: "email",
          when: { all: [{ eq: { field: "plan", value: "pro" } }, { eq: { field: "plan", value: "free" } }] },
          message: { key: "rules.never" },
        },
      ],
    };
    const r = await runDiff(c, makeOld(), "never", never);
    expect(r.totals.divergences).toBe(0);
    expect(r.verdict).toBe("FAIL");
    expect(r.reasons.join("\n")).toContain("Signup.required_when.never: not exercised");
    expect(r.coverage.find((x: any) => x.ruleId === "Signup.required_when.never").failed).toBe(0);
  });

  it("keeps old-validator errors as their own class, never as reject", async () => {
    const c = await connectClient();
    const good = makeOld();
    const throwing: Old = (i) => {
      if (i.quantity === 0) throw new Error("cannot parse quantity");
      return good(i);
    };
    const r = await runDiff(c, throwing, "throws");
    expect(r.oldErrors.count).toBeGreaterThan(0);
    expect(r.oldErrors.byMessage[0].message).toContain("cannot parse quantity");
    expect(r.totals.divergences).toBe(0); // not counted as a reject
    expect(r.verdict).toBe("FAIL");
    expect(r.reasons.join("\n")).toContain("old validator errored");
    const tolerated = await runDiff(c, throwing, "throws2", undefined, { maxOldErrors: 100000, floor: 0 });
    expect(tolerated.verdict).toBe("PASS");
  });

  it("warns on a different error field with the same verdict", async () => {
    const c = await connectClient();
    const good = makeOld();
    const moved: Old = (i) => {
      const r = good(i);
      return { accept: r.accept, paths: r.paths.map((p) => (p === "end" ? "start" : p)) };
    };
    const r = await runDiff(c, moved, "moved");
    expect(r.totals.divergences).toBe(0);
    expect(r.totals.locationWarnings).toBeGreaterThan(0);
    expect(r.verdict).toBe("PASS");
  });

  it("accepts inline inputs and results, and validates shapes", async () => {
    const c = await connectClient();
    const base = { rules, floor: 0, minInputs: 0 };
    const ok = await call(c, "compare_results", { ...base, inputs: [{ plan: "pro" }], oldResults: [{ accept: false, paths: ["company"] }] });
    expect(ok.structuredContent?.verdict).toBe("PASS");
    const bad = await call(c, "compare_results", { ...base, inputs: [{}, {}], oldResults: [{ accept: true }] });
    expect(bad.isError).toBe(true);
    const bad2 = await call(c, "compare_results", { ...base, inputs: [{}], oldResults: [{ paths: [] }] });
    expect(bad2.isError).toBe(true);
    const bad3 = await call(c, "compare_results", { ...base, inputs: [{}] });
    expect(bad3.isError).toBe(true);
  });

  it("refuses input files outside the roots", async () => {
    const c = await connectClient();
    const r = await call(c, "compare_results", { rules, inputsPath: "/etc/hosts", oldResults: [] });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("outside the allowed roots");
  });
});
