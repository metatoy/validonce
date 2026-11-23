// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// promptfoo provider: GitHub Copilot CLI, non-interactive, with conservative safety flags
// (memory note copilot-cli-handoff). cwd = the prepared scratch dir; never --allow-all-paths / --allow-all-urls.
// Cost: session.usage_checkpoint.data.totalNanoAiu / 1e9 = credits; 1 credit = $0.01.
// Spends Copilot credits: refuses unless VALIDONCE_EVAL_APPROVED=1. VALIDONCE_EVAL_PLAN_ONLY=1 returns the command only.
import { spawn } from "node:child_process";
import { prepare } from "../prepare.mjs";
import { requireApproval } from "../lib/util.mjs";

export const DENY = ["shell(git push)", "shell(git commit)", "shell(rm)", "shell(curl)", "shell(wget)", "shell(ssh)", "shell(security)", "shell(sudo)"];

export function buildArgs(prompt, prep, config = {}) {
  return [
    "-p", prompt,
    "--model", config.model ?? process.env.EVAL_COPILOT_MODEL ?? "gpt-5.3-codex",
    "--allow-all-tools", // required for -p; the deny rules below still win
    "--disable-builtin-mcps", // otherwise the built-in github-mcp-server connects with API write tools
    ...DENY.flatMap((d) => ["--deny-tool", d]),
    "--additional-mcp-config", `@${prep.copilotMcp}`,
    "--no-ask-user",
    "--output-format", "json",
  ];
}

export function parseJsonl(text) {
  const events = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    try { events.push(JSON.parse(s)); } catch { /* not an event line */ }
  }
  return events;
}

export function summarize(events) {
  let nano = 0;
  let turns = 0;
  let last = "";
  for (const e of events) {
    if (e.type === "session.usage_checkpoint") nano = Math.max(nano, Number(e.data?.totalNanoAiu ?? 0));
    if (e.type === "assistant.turn_start") turns++;
    if (e.type === "assistant.message" && typeof e.data?.content === "string" && e.data.content) last = e.data.content;
  }
  const credits = nano / 1e9;
  return { credits, costUsd: credits * 0.01, turns, last };
}

export default class CopilotProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
    this.providerId = options.id ?? "copilot";
  }
  id() {
    return this.providerId;
  }
  async callApi(prompt, context) {
    const vars = context?.vars ?? {};
    const prep = prepare({ caseId: vars.case, variant: vars.variant ?? "baseline", agent: "copilot" });
    const args = buildArgs(prompt, prep, this.config);
    if (process.env.VALIDONCE_EVAL_PLAN_ONLY === "1")
      return { output: `PLAN ONLY (no copilot call): cwd=${prep.work} copilot ${args.map((a) => JSON.stringify(a)).join(" ")}`, metadata: { ...prep, plan: args } };
    requireApproval("The Copilot provider");
    const t0 = Date.now();
    const timeoutMs = this.config.timeoutMs ?? 20 * 60_000;
    const { code, stdout, stderr, timedOut } = await new Promise((resolve) => {
      const child = spawn("copilot", args, { cwd: prep.work, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      let out = "", err = "", timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout: out, stderr: err, timedOut }); });
      child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, stdout: out, stderr: String(e), timedOut }); });
    });
    const events = parseJsonl(stdout);
    const s = summarize(events);
    const meta = { ...prep, turns: s.turns, seconds: (Date.now() - t0) / 1000, credits: s.credits, costUsd: s.costUsd, exitCode: code };
    if (timedOut) return { error: `copilot timed out after ${timeoutMs} ms`, cost: s.costUsd, metadata: meta };
    if (code !== 0) return { error: `copilot exited ${code}: ${stderr.slice(0, 500)}`, cost: s.costUsd, metadata: meta };
    return { output: s.last || "(no assistant message)", cost: s.costUsd, metadata: meta };
  }
}
