#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Verifies the VS Code flow without Copilot: prepares a run, drops recorded replays into the folders
// (good into zod and fluentvalidation, bad into pydantic), fills run.json, scores them, and checks that the
// generated .vscode/mcp.json really launches the MCP server (initialize + tools/list over stdio).
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyReplay } from "./providers/replay.mjs";
import { defaultRunId } from "./prepare.mjs";
import { prepareVscode } from "./prepare-vscode.mjs";

const runId = process.env.EVAL_RUN_ID ?? `dry-${defaultRunId()}`;
const plan = { zod: "good", fluentvalidation: "good", pydantic: "bad" };
const prepared = prepareVscode(Object.keys(plan), runId);
for (const { caseId, folder } of prepared) {
  applyReplay(folder, caseId, plan[caseId]);
  writeFileSync(join(folder, "run.json"), JSON.stringify({ model: `replay-${plan[caseId]}`, credits: 0, minutes: 0, notes: "dry verify, no model" }, null, 2) + "\n");
}

// the exact command in .vscode/mcp.json
const cfg = JSON.parse(readFileSync(join(prepared[0].folder, ".vscode/mcp.json"), "utf8")).servers.validonce;
console.log(`.vscode/mcp.json: ${JSON.stringify(cfg)}`);
const child = spawn(cfg.command, cfg.args, { cwd: prepared[0].folder, stdio: ["pipe", "pipe", "ignore"] });
const lines = [];
let buf = "";
child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
const wait = async (id) => { for (let i = 0; i < 100; i++) { const m = lines.find((l) => l.id === id); if (m) return m; await new Promise((r) => setTimeout(r, 50)); } throw new Error(`no response to ${id}`); };
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "dry-verify", version: "0" } } });
const init = await wait(1);
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
const tools = await wait(2);
console.log(`initialize: ${init.result?.serverInfo?.name} ${init.result?.serverInfo?.version}`);
console.log(`tools/list: ${tools.result.tools.map((t) => t.name).join(", ")}`);
child.kill();

const r = spawnSync(process.execPath, [new URL("./score-vscode.mjs", import.meta.url).pathname, runId], { stdio: "inherit" });
process.exit(r.status ?? 1);
