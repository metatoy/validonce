// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { Issue } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toIssue(path: unknown, o: unknown): Issue | undefined {
  if (!isRecord(o)) return undefined;
  if (typeof o.ruleId !== "string" || typeof o.key !== "string")
    return undefined;
  if (!Array.isArray(path)) return undefined;
  const params = isRecord(o.params) ? o.params : {};
  return {
    path: path.map((p) => String(p)),
    ruleId: o.ruleId,
    key: o.key,
    params,
  };
}

/** Issues from a FastAPI 422 body `{detail: [...]}`; non-validonce entries are ignored. */
export function issuesFromFastApi(body: unknown): Issue[] {
  if (!isRecord(body) || !Array.isArray(body.detail)) return [];
  const out: Issue[] = [];
  for (const entry of body.detail) {
    if (!isRecord(entry)) continue;
    if (typeof entry.type !== "string" || !entry.type.startsWith("validonce."))
      continue;
    const loc = Array.isArray(entry.loc) ? entry.loc : [];
    const path = loc[0] === "body" ? loc.slice(1) : loc;
    const issue = toIssue(path, entry.ctx);
    if (issue) out.push(issue);
  }
  return out;
}

/** Issues from an ASP.NET ProblemDetails body carrying a top-level `validonce` extension. */
export function issuesFromProblemDetails(body: unknown): Issue[] {
  if (!isRecord(body) || !Array.isArray(body.validonce)) return [];
  const out: Issue[] = [];
  for (const entry of body.validonce) {
    if (!isRecord(entry)) continue;
    const issue = toIssue(entry.path, entry);
    if (issue) out.push(issue);
  }
  return out;
}

/** Detects FastAPI or ProblemDetails; returns [] for anything else. */
export function issuesFromResponse(body: unknown): Issue[] {
  if (!isRecord(body)) return [];
  if (Array.isArray(body.detail)) return issuesFromFastApi(body);
  if (Array.isArray(body.validonce)) return issuesFromProblemDetails(body);
  return [];
}

/** Dotted-path -> message map (first issue per path wins); message from the catalog, else the key. */
export function fieldErrorsFromIssues(
  issues: readonly Issue[],
  messages?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const name = issue.path.join(".");
    if (Object.hasOwn(out, name)) continue;
    const template = messages?.[issue.key];
    out[name] =
      template === undefined
        ? issue.key
        : template.replace(/\{(\w+)\}/g, (whole, n: string) =>
            Object.hasOwn(issue.params, n) ? String(issue.params[n]) : whole,
          );
  }
  return out;
}
