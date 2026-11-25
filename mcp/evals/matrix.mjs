#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Prints the planned real-run matrix and how to estimate its cost. Calls nothing.
import { AGENTS, CASES, REPEATS } from "./cases.mjs";

const cases = Object.keys(CASES);
const variants = Number(process.env.EVAL_VARIANTS ?? 1);
const per = cases.length * REPEATS * variants;
console.log(`cases (${cases.length}): ${cases.join(", ")}`);
console.log(`agents (${AGENTS.length}): ${AGENTS.join(", ")}   repeats: ${REPEATS}   skill variants: ${variants}`);
console.log(`planned real runs: ${cases.length} cases x ${AGENTS.length} agents x ${REPEATS} repeats x ${variants} variant(s) = ${per * AGENTS.length}  (${per} per agent)`);
console.log(`
Cost estimate method: tokens per run are UNKNOWN until a pilot. Pilot first: 1 run per agent on the 'zod' case
(and one tricky case), with maxBudgetUsd capping each Claude run. Read per-run cost from the results
(cost_usd / credits / tokens_total metrics), take the mean per case group, then:
  Claude   estimate = runs x mean cost_usd (USD; opus rates apply)
  Copilot  estimate = runs x mean credits (1 credit = $0.01; Pro+ has 7,000 credits a month)
A tuning round re-runs the whole matrix once per changed variant (at most 3 rounds); state each round's run count
and estimate before it starts. Hard caps: Claude maxBudgetUsd per run (default 5), run timeout 20 min.`);
