// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { type Rule, ValidonceFormatError, evaluate, parseRuleSet } from "validonce";
import { fieldsOf } from "./rules";
import { ToolError } from "./sdk";
import { type Handwritten, type RunnerInfo, renderReport } from "./report";

export const MAX_LISTED = 20;

export interface CompareOptions {
  rules: unknown;
  inputs: unknown[];
  old: unknown[];
  floor: number;
  minInputs: number;
  maxOldErrors: number;
  runner?: RunnerInfo;
  handwritten?: Handwritten[];
}

interface OldNorm {
  error?: string;
  accept: boolean;
  paths: string[];
}

/** "$.a", "/a/b", "a.b" all become "a.b". */
export function normPath(p: string): string {
  return p.replace(/^\$\.?/, "").replace(/^[/.]+/, "").replace(/\//g, ".");
}

function normOld(o: unknown, i: number): OldNorm {
  if (typeof o !== "object" || o === null || Array.isArray(o))
    throw new ToolError(`Old result ${i} is not an object.`);
  const r = o as { accept?: unknown; paths?: unknown; error?: unknown };
  if (typeof r.error === "string" && r.error !== "") return { error: r.error, accept: false, paths: [] };
  if (typeof r.accept !== "boolean")
    throw new ToolError(`Old result ${i} needs a boolean "accept" (or a non-empty "error").`);
  if (r.paths !== undefined && (!Array.isArray(r.paths) || r.paths.some((p) => typeof p !== "string")))
    throw new ToolError(`Old result ${i}: "paths" must be an array of strings.`);
  return { accept: r.accept, paths: [...new Set(((r.paths ?? []) as string[]).map(normPath))].sort() };
}

const setEq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const size = (v: unknown) => {
  const o = typeof v === "object" && v !== null ? v : {};
  return [Object.keys(o).length, JSON.stringify(v).length] as const;
};

export function compareResults(opts: CompareOptions) {
  let rules: Rule[];
  try {
    rules = parseRuleSet(opts.rules).rules;
  } catch (e) {
    throw new ToolError(`Invalid rule set: ${e instanceof ValidonceFormatError ? e.message : "unreadable"}`);
  }
  if (opts.inputs.length !== opts.old.length)
    throw new ToolError(`inputs (${opts.inputs.length}) and old results (${opts.old.length}) differ in length; they must match one to one, in order.`);
  for (const [i, x] of opts.inputs.entries())
    if (typeof x !== "object" || x === null || Array.isArray(x)) throw new ToolError(`Input ${i} is not an object.`);

  const coverage = new Map(rules.map((r) => [r.id, { failed: 0, passed: 0 }]));
  const defaultPath = (r: Rule) => normPath(r.path ?? (r.kind === "compare" ? r.left.field : r.kind === "required_when" ? r.field : (r.fields[0] as string)));

  type Div = {
    index: number;
    input: unknown;
    old: { accept: boolean; paths: string[] };
    new: { accept: boolean; paths: string[] };
    ruleIds: string[];
  };
  const divs: Div[] = [];
  const warns: Array<{ index: number; input: unknown; old: string[]; new: string[]; ruleIds: string[] }> = [];
  const errs = new Map<string, { message: string; count: number; firstIndex: number }>();
  let agree = 0;
  let oldErrors = 0;
  let oldRejectsNewAccepts = 0;

  opts.inputs.forEach((input, index) => {
    const issues = evaluate(rules, input as Record<string, unknown>);
    const failedIds = [...new Set(issues.map((x) => x.ruleId))];
    for (const [id, c] of coverage) failedIds.includes(id) ? c.failed++ : c.passed++;
    const o = normOld(opts.old[index], index);
    if (o.error !== undefined) {
      oldErrors++;
      const msg = o.error.slice(0, 200);
      const e = errs.get(msg);
      if (e) e.count++;
      else errs.set(msg, { message: msg, count: 1, firstIndex: index });
      return;
    }
    const nPaths = [...new Set(issues.map((x) => normPath(x.path.join("."))))].sort();
    const nAccept = issues.length === 0;
    if (o.accept !== nAccept) {
      let ruleIds = failedIds;
      if (ruleIds.length === 0) {
        ruleIds = rules.filter((r) => o.paths.includes(defaultPath(r)) || fieldsOf(r).some((f) => o.paths.includes(f))).map((r) => r.id);
        oldRejectsNewAccepts++;
      }
      divs.push({ index, input, old: { accept: o.accept, paths: o.paths }, new: { accept: nAccept, paths: nPaths }, ruleIds });
    } else {
      agree++;
      if (!o.accept && !setEq(o.paths, nPaths))
        warns.push({ index, input, old: o.paths, new: nPaths, ruleIds: failedIds });
    }
  });

  divs.sort((a, b) => {
    const [ak, al] = size(a.input);
    const [bk, bl] = size(b.input);
    return ak - bk || al - bl || a.index - b.index;
  });

  let keysInEvery: string[] = [];
  if (divs.length) {
    keysInEvery = Object.keys(divs[0]?.input as object);
    for (const d of divs) keysInEvery = keysInEvery.filter((k) => Object.hasOwn(d.input as object, k));
  }
  const byRule = new Map<string, { ruleId: string; count: number; smallest: Div }>();
  for (const d of divs) {
    for (const id of d.ruleIds) {
      const e = byRule.get(id);
      if (e) e.count++;
      else byRule.set(id, { ruleId: id, count: 1, smallest: d }); // divs are sorted: first seen is smallest
    }
  }

  const cov = [...coverage].map(([ruleId, c]) => ({
    ruleId,
    failed: c.failed,
    passed: c.passed,
    exercised: c.failed >= opts.floor && c.passed >= opts.floor,
  }));

  const reasons: string[] = [];
  if (divs.length) reasons.push(`${divs.length} divergence(s): accept/reject differs between the old validator and validonce.`);
  if (oldErrors > opts.maxOldErrors)
    reasons.push(`The old validator errored on ${oldErrors} input(s) (allowed: ${opts.maxOldErrors}). These inputs prove nothing.`);
  for (const c of cov)
    if (!c.exercised)
      reasons.push(`Rule ${c.ruleId}: not exercised (failed ${c.failed}, passed ${c.passed}; floor ${opts.floor} each).`);
  if (opts.inputs.length < opts.minInputs)
    reasons.push(`Too few inputs: ${opts.inputs.length} (minimum ${opts.minInputs}).`);
  const verdict = reasons.length === 0 ? ("PASS" as const) : ("FAIL" as const);

  const counterexamples = divs.slice(0, MAX_LISTED);
  const locationWarnings = warns.slice(0, MAX_LISTED);
  const oldErrorList = [...errs.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  const totals = {
    inputs: opts.inputs.length,
    agree,
    divergences: divs.length,
    locationWarnings: warns.length,
    oldErrors,
  };
  const report = renderReport({
    verdict,
    reasons,
    totals,
    coverage: cov,
    floor: opts.floor,
    counterexamples,
    keysInEveryDivergence: keysInEvery,
    locationWarnings,
    oldErrors: oldErrorList,
    runner: opts.runner,
    handwritten: opts.handwritten,
  });

  return {
    verdict,
    reasons,
    totals,
    divergenceSummary: {
      oldRejectsNewAccepts,
      oldAcceptsNewRejects: divs.length - oldRejectsNewAccepts,
      keysInEveryDivergence: keysInEvery,
      byRule: [...byRule.values()].sort((a, b) => b.count - a.count).slice(0, 20),
    },
    counterexamples,
    locationWarnings,
    oldErrors: { count: oldErrors, byMessage: oldErrorList },
    coverage: cov,
    report,
  };
}
