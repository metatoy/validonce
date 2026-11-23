#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Dry run: the free replay providers only (no model, no Copilot). good => assertions pass, bad => differential fails.
//   node dry-run.mjs [filter-pattern]   (default: zod|pydantic|tricky-arithmetic)
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const pattern = process.argv[2] ?? "zod|pydantic|tricky/arithmetic";
const r = spawnSync(process.execPath, [fileURLToPath(new URL("./run-eval.mjs", import.meta.url)), "replay-good,replay-bad", "--repeat", "1", "--filter-pattern", pattern, "--no-table"], { stdio: "inherit" });
process.exit(r.status ?? 1);
