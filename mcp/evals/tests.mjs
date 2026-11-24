// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// The promptfoo test list, built from cases.mjs. VALIDONCE_EVAL_GROUP picks the set: "tuning" (default: the before and
// tricky fixtures), "holdout" (VALIDONCE_HOLDOUT_CASES), or "all". VALIDONCE_EVAL_CASES (comma list) narrows it further.
import { CASES, caseDescription } from "./cases.mjs";

export default function () {
  const group = process.env.VALIDONCE_EVAL_GROUP ?? "tuning";
  const only = process.env.VALIDONCE_EVAL_CASES?.split(",").map((s) => s.trim()).filter(Boolean);
  return Object.entries(CASES)
    .filter(([, c]) => (group === "all" ? true : group === "tuning" ? c.group !== "holdout" : c.group === group))
    .filter(([id]) => !only || only.includes(id))
    .map(([id, c]) => ({ description: caseDescription(id, c), vars: { case: id } }));
}
