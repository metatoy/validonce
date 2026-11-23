// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// (e) The project still builds / loads after the migration, and where the stack can export rules from the migrated
// validator (Python ValidonceModel, C# ValidonceValidator), the exported rules equal validonce-rules.json.
// TypeScript: validonce-rules.json is the source, so the check is that the module still imports (validonce resolves
// from node_modules, a link to the workspace package). Heavy commands (dotnet) are safe: maxConcurrency is 1.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRun, readAgentRules, ruleKey } from "../lib/run.mjs";
import { ensureDotnetExporter } from "../lib/util.mjs";

const here = fileURLToPath(new URL("..", import.meta.url));
const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" };

export default function (_output, context) {
  const run = loadRun(context);
  const c = run.case, b = c.build;
  const cmd = b.cmd.startsWith(".") ? join(run.work, b.cmd) : b.cmd;
  const outDir = join(run.runDir, "build");
  const args = c.stack === "dotnet" ? [...b.args, "-o", outDir] : b.args;
  const r = spawnSync(cmd, args, { cwd: run.work, encoding: "utf8", timeout: 240_000, env });
  if (r.status !== 0) return { pass: false, score: 0, reason: `${b.cmd} failed (exit ${r.status}): ${(r.stderr || r.stdout || "").slice(-300)}` };
  if (!c.export || run.expected.migrate.length === 0) return { pass: true, score: 1, reason: `${b.cmd} ok${c.export ? "" : " (no export for this stack; validonce-rules.json is the source)"}` };

  const agent = readAgentRules(run.work);
  if (agent.error) return { pass: false, score: 0, reason: `builds, but ${agent.error}` };
  let p;
  if (c.export.kind === "python")
    p = spawnSync(join(run.work, ".venv/bin/python"), ["-I", join(here, "exporters/export_pydantic.py"), run.work, c.export.module, c.export.className], { encoding: "utf8", timeout: 60_000, cwd: run.work });
  else
    p = spawnSync("dotnet", [ensureDotnetExporter(), join(outDir, c.export.assembly), c.export.validator], { encoding: "utf8", timeout: 120_000, cwd: run.work, env });
  let exported;
  try { exported = JSON.parse(p.stdout); } catch { return { pass: false, score: 0, reason: `builds, but export failed: ${(p.stderr || p.stdout).slice(-300)}` }; }
  if (exported.error) return { pass: false, score: 0, reason: `builds, but the migrated validator exports no rules: ${exported.error}` };
  const a = new Set(exported.rules.map(ruleKey)), f = new Set(agent.rules.map(ruleKey));
  const same = a.size === f.size && [...a].every((k) => f.has(k));
  return { pass: same, score: same ? 1 : 0, reason: same ? `builds; exported ${a.size} rules equal validonce-rules.json` : `builds, but exported rules (${a.size}) differ from validonce-rules.json (${f.size})` };
}
