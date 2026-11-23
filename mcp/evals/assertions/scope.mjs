// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// (d) The diff against the pristine copy touches only allowed files (allowedFiles in the fixture's expected.json).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles, loadRun } from "../lib/run.mjs";

const glob = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$");

export default function (_output, context) {
  const run = loadRun(context);
  const allowed = run.expected.allowedFiles.map(glob);
  const before = new Map(listFiles(run.pristine).map((f) => [f, readFileSync(join(run.pristine, f))]));
  const after = listFiles(run.work);
  const touched = [];
  for (const f of after) {
    const b = before.get(f);
    if (!b || !b.equals(readFileSync(join(run.work, f)))) touched.push(f);
  }
  for (const f of before.keys()) if (!after.includes(f)) touched.push(f);
  const bad = touched.filter((f) => !allowed.some((re) => re.test(f)));
  return { pass: bad.length === 0, score: bad.length === 0 ? 1 : 0, reason: bad.length ? `outside the allowed set: ${bad.join(", ")}` : `changed: ${touched.join(", ") || "(nothing)"}` };
}
