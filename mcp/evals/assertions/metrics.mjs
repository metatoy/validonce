// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Records tokens / cost / turns / time per run as named metrics. Always passes; use weight: 0 in the config.
export default function (_output, context) {
  const r = context?.providerResponse ?? {};
  const m = r.metadata ?? {};
  const named = {
    tokens_total: r.tokenUsage?.total ?? 0,
    tokens_in: r.tokenUsage?.prompt ?? 0,
    tokens_out: r.tokenUsage?.completion ?? 0,
    cost_usd: r.cost ?? 0,
    credits: m.credits ?? 0,
    turns: m.turns ?? 0,
    seconds: m.seconds ?? 0,
  };
  return { pass: true, score: 1, reason: Object.entries(named).map(([k, v]) => `${k}=${typeof v === "number" ? +v.toFixed(3) : v}`).join(" "), namedScores: named };
}
