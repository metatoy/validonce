// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Low-weight judgement of the report's clarity. DISABLED by default: it calls a model and spends tokens.
// Enable with VALIDONCE_EVAL_RUBRIC=1 (and VALIDONCE_EVAL_APPROVED=1); grader: EVAL_RUBRIC_PROVIDER
// (default anthropic:messages:claude-haiku-4-5, bulk work goes down the model ladder).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRun } from "../lib/run.mjs";

const RUBRIC = `This is a migration report written by a coding agent for a developer who moved hand-written validation rules to validonce.
Score 1.0 if a developer could act on it without asking questions: it says which rules were migrated, which were kept hand-written and why, what the differential check proved, and what changed.
0.5 if it is correct but vague or missing one of those. 0.0 if it is missing, misleading or unreadable.`;

export default async function (_output, context) {
  if (process.env.VALIDONCE_EVAL_RUBRIC !== "1") return { pass: true, score: 1, reason: "rubric disabled (VALIDONCE_EVAL_RUBRIC != 1); no model was called" };
  if (process.env.VALIDONCE_EVAL_APPROVED !== "1") return { pass: false, score: 0, reason: "rubric needs VALIDONCE_EVAL_APPROVED=1 (spends tokens)" };
  const run = loadRun(context);
  const p = join(run.work, "MIGRATION_REPORT.md");
  if (!existsSync(p)) return { pass: false, score: 0, reason: "no report" };
  const { assertions } = await import("promptfoo");
  const grader = process.env.EVAL_RUBRIC_PROVIDER ?? "anthropic:messages:claude-haiku-4-5";
  const r = await assertions.matchesLlmRubric(RUBRIC, readFileSync(p, "utf8"), { provider: grader });
  return { pass: r.pass, score: r.score, reason: r.reason };
}
