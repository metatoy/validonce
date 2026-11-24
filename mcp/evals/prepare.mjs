#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Prepares a fresh scratch working directory for one agent run:
//   <scratch>/<run-id>/<case>__<variant>__<agent>__<rand>/{work,pristine,copilot-mcp.json}
// `pristine` is the fixture before the agent (and before skill/MCP config); `work` is what the agent gets.
//   node prepare.mjs --case zod --variant baseline --agent claude [--run-id ID]
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { CASES, caseDir } from "./cases.mjs";
import { assertOutsideParentWorkspace, ensureNugetFeed, ensureDir, evalsDir, mcpEntry, readJson, repoRoot, scratchRoot, skillsDir, testbeds } from "./lib/util.mjs";

// case.mjs, replay/ and SOURCE.md belong to a hold-out case's answer side, never the agent's copy
const SKIP = new Set(["expected.json", "node_modules", "bin", "obj", ".venv", "__pycache__", "inputs", ".git", "case.mjs", "replay", "SOURCE.md"]);
const skipFile = (name) => SKIP.has(name) || /^io_on_import\./.test(name);

/** "baseline" = skills/validonce-migrate; otherwise mcp/evals/variants/<name>/ (a copy of the skill dir) or an absolute path. */
export function resolveVariant(variant) {
  if (variant === "baseline") return skillsDir;
  return isAbsolute(variant) ? variant : join(evalsDir, "variants", variant);
}

export function defaultRunId() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
}

/**
 * agent: "claude" | "copilot" (CLI) | "replay" | "vscode" (Copilot in VS Code, run by hand; MCP config in .vscode/mcp.json).
 * layout (optional): { runDir, work, pristine } to place the directories yourself (prepare-vscode.mjs does).
 */
export function prepare({ caseId, variant = "baseline", agent, runId = process.env.EVAL_RUN_ID ?? defaultRunId(), layout }) {
  const c = CASES[caseId];
  if (!c) throw new Error(`unknown case: ${caseId}`);
  const runDir = assertOutsideParentWorkspace(layout?.runDir ?? join(scratchRoot(), runId, `${caseId}__${variant.replace(/[^\w.-]/g, "_")}__${agent}__${randomBytes(3).toString("hex")}`));
  const work = assertOutsideParentWorkspace(layout?.work ?? join(runDir, "work"));
  const pristine = assertOutsideParentWorkspace(layout?.pristine ?? join(runDir, "pristine"));
  mkdirSync(work, { recursive: true });

  // 1. fixture files (never expected.json, inputs, build output, io_on_import fixtures)
  const src = caseDir(c, testbeds);
  cpSync(src, work, { recursive: true, filter: (s) => !skipFile(basename(s)) });
  // 2. dependencies: link, don't copy (pnpm store / venv live in the repo, outside the agent's cwd)
  const nm = join(testbeds, "before/node_modules");
  if (c.stack === "js" && existsSync(nm)) symlinkSync(nm, join(work, "node_modules"), "dir");
  if (c.stack === "python") symlinkSync(join(repoRoot, "python/.venv"), join(work, ".venv"), "dir"); // pydantic + the workspace validonce (editable)
  if ((c.group === "before" || c.group === "holdout") && c.stack === "js") {
    const p = readJson(join(testbeds, "before/package.json"));
    const dev = { ...p.devDependencies };
    delete dev.validonce;
    writeFileSync(join(work, "package.json"), JSON.stringify({ name: `before-${caseId}`, private: true, version: "0.0.0", type: "module", dependencies: p.dependencies, devDependencies: dev }, null, 2) + "\n");
  }
  if (c.stack === "dotnet") {
    const feed = ensureNugetFeed();
    writeFileSync(join(work, "nuget.config"), `<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n  <packageSources>\n    <clear />\n    <add key="validonce-local" value="${feed}" />\n  </packageSources>\n</configuration>\n`);
  }
  // 3. pristine copy, taken before the agent's tooling is added
  cpSync(work, pristine, { recursive: true, verbatimSymlinks: true });

  // 4. skill
  const skillSrc = resolveVariant(variant);
  if (!existsSync(skillSrc)) throw new Error(`skill variant not found: ${skillSrc}`);
  const skillDest = join(work, agent === "copilot" || agent === "vscode" ? ".github/skills/validonce-migrate" : ".claude/skills/validonce-migrate");
  mkdirSync(join(skillDest, ".."), { recursive: true });
  cpSync(skillSrc, skillDest, { recursive: true, filter: (s) => !["node_modules", "obj", "bin", "__pycache__"].includes(basename(s)) });

  // 5. MCP config pointing at the locally built server
  if (!existsSync(mcpEntry)) throw new Error(`mcp/dist/index.js not built: run "pnpm --filter validonce-mcp build"`);
  const server = { command: process.execPath, args: [mcpEntry] };
  if (agent === "vscode") {
    // VS Code MCP config: "servers" (not "mcpServers"), each with a "type".
    mkdirSync(join(work, ".vscode"), { recursive: true });
    writeFileSync(join(work, ".vscode/mcp.json"), JSON.stringify({ servers: { validonce: { type: "stdio", ...server } } }, null, 2) + "\n");
  } else {
    writeFileSync(join(work, ".mcp.json"), JSON.stringify({ mcpServers: { validonce: server } }, null, 2) + "\n");
  }
  // Copilot: the file lives next to (not inside) the working directory; it is passed with @<path>.
  const copilotMcp = join(runDir, "copilot-mcp.json");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(copilotMcp, JSON.stringify({ mcpServers: { validonce: { type: "local", ...server, tools: ["*"] } } }, null, 2) + "\n");

  return {
    runId, caseId, variant, agent, runDir, work, pristine, copilotMcp,
    mcpServer: server,
    skillSource: skillSrc,
    skillHasSkillMd: existsSync(join(skillDest, "SKILL.md")),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []));
  const r = prepare({ caseId: a.case, variant: a.variant ?? "baseline", agent: a.agent ?? "claude", runId: a["run-id"] });
  console.log(JSON.stringify(r, null, 2));
}
