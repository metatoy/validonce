// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { existsSync, readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, relative } from "node:path";
import { CASES } from "../cases.mjs";
import { readJson, testbeds } from "./util.mjs";

/** Everything an assertion needs about one run, from the provider's metadata. */
export function loadRun(context) {
  const meta = context?.providerResponse?.metadata;
  if (!meta?.work || !meta?.pristine) throw new Error("provider response has no run metadata (work/pristine)");
  const caseId = meta.caseId;
  const c = CASES[caseId];
  const expected = readJson(join(testbeds, c.dir, "expected.json"));
  return { meta, caseId, case: c, expected, work: meta.work, pristine: meta.pristine, runDir: meta.runDir };
}

/** The agent's proposed rules: validonce-rules.json as {version, rules} or a bare array. */
export function readAgentRules(work) {
  const p = join(work, "validonce-rules.json");
  if (!existsSync(p)) return { error: "validonce-rules.json not found" };
  let j;
  try { j = JSON.parse(readFileSync(p, "utf8")); } catch (e) { return { error: `validonce-rules.json is not valid JSON: ${e.message}` }; }
  const rules = Array.isArray(j) ? j : j?.rules;
  if (!Array.isArray(rules)) return { error: 'validonce-rules.json has no "rules" array' };
  return { rules, ruleSet: { version: 1, rules } };
}

const IGNORE_TOP = new Set([".claude", ".github", ".copilot", ".mcp.json", "node_modules", ".venv", "bin", "obj", "__pycache__", ".pytest_cache", ".git", ".ruff_cache", "nuget.config", ".vscode", "PROMPT.md", "RUN-SHEET.md", "run.json"]);
export function listFiles(root, dir = root) {
  const out = [];
  for (const n of readdirSync(dir)) {
    if (IGNORE_TOP.has(n)) continue;
    const p = join(dir, n);
    const st = lstatSync(p);
    if (st.isDirectory()) out.push(...listFiles(root, p));
    else out.push(relative(root, p));
  }
  return out.sort();
}

const DEFAULT_PATH = { required_when: (r) => r.field, compare: (r) => r.left?.field, at_least_one_of: (r) => r.fields?.[0], exactly_one_of: (r) => r.fields?.[0], all_or_none: (r) => r.fields?.[0] };
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
/** Semantic identity of a rule: ignores id and message, and a path equal to the default. withType: false also ignores compare.type. */
export function ruleKey(r, { withType = true } = {}) {
  const { kind, field, fields, when, left, op, right, type, path } = r ?? {};
  const o = { kind, field, fields: fields && [...fields].sort(), when, left, op, right };
  if (withType) o.type = type;
  if (path !== undefined && path !== DEFAULT_PATH[kind]?.(r)) o.path = path;
  return JSON.stringify(sortKeys(o));
}
