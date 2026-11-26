// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// promptfoo provider: Claude Code through the Claude Agent SDK (the same SDK promptfoo's
// `anthropic:claude-agent-sdk` provider wraps). promptfoo's provider takes one static `working_dir` per
// provider entry; this eval needs a FRESH scratch dir per call (case x variant x repeat), and the
// assertions need to know which one. So this thin wrapper calls prepare(), runs the SDK against it
// and returns the directory in `metadata`.
//
// Config (all optional): model (default env EVAL_CLAUDE_MODEL or "opus"), maxTurns (60),
// maxBudgetUsd (5, per run), timeoutMs (1200000), planOnly.
// Spends tokens: refuses to run unless VALIDONCE_EVAL_APPROVED=1. VALIDONCE_EVAL_PLAN_ONLY=1 prints the
// options without calling anything.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { prepare } from "../prepare.mjs";
import { requireApproval } from "../lib/util.mjs";

const DENY_BASH = ["git push", "git commit", "rm", "curl", "wget", "ssh", "security", "sudo"].map((c) => `Bash(${c}:*)`);

export function buildOptions(prep, config = {}) {
  return {
    cwd: prep.work,
    model: process.env.EVAL_CLAUDE_MODEL ?? config.model ?? "opus",
    maxTurns: config.maxTurns ?? 60,
    maxBudgetUsd: Number(process.env.EVAL_MAX_USD ?? config.maxBudgetUsd ?? 5),
    // file read/edit + bash inside the dir, the Skill tool, and the validonce MCP server. Nothing else.
    tools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash", "Skill"],
    allowedTools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash", "Skill", "mcp__validonce"],
    disallowedTools: ["WebFetch", "WebSearch", "Task", ...DENY_BASH],
    permissionMode: "dontAsk",
    settingSources: ["project"], // .claude/skills and .mcp.json of the scratch dir only; no user settings, hooks or CLAUDE.md
    skills: "all",
    mcpServers: { validonce: { type: "stdio", ...prep.mcpServer } },
    strictMcpConfig: true,
    persistSession: false,
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      network: { allowedDomains: [] },
      filesystem: { allowWrite: [prep.work, ...(prep.extraWrite ?? [])] },
    },
  };
}

export default class ClaudeProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
    this.providerId = options.id ?? "claude";
  }
  id() {
    return this.providerId;
  }
  async callApi(prompt, context) {
    const vars = context?.vars ?? {};
    const prep = prepare({ caseId: vars.case, variant: vars.variant ?? "baseline", agent: "claude" });
    const options = buildOptions(prep, this.config);
    if (process.env.VALIDONCE_EVAL_PLAN_ONLY === "1")
      return { output: `PLAN ONLY (no model call): claude agent sdk query() with ${JSON.stringify(options)}`, metadata: { ...prep, plan: options } };
    requireApproval("The Claude provider");
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.config.timeoutMs ?? 20 * 60_000);
    const t0 = Date.now();
    let result;
    // One line per SDK message (type, subtype, tool names, seconds): enough to see where a run stalls, without content.
    const log = join(prep.runDir, "agent-messages.jsonl");
    const note = (m) => {
      const tools = (m.message?.content ?? []).filter((c) => c?.type === "tool_use").map((c) => c.name);
      appendFileSync(log, `${JSON.stringify({ s: Math.round((Date.now() - t0) / 1000), type: m.type, subtype: m.subtype, tools: tools.length ? tools : undefined })}\n`);
    };
    try {
      for await (const m of query({ prompt, options: { ...options, abortController: ac, env: { ...process.env, ...prep.env, CLAUDE_CODE_DISABLE_TELEMETRY: "1" } } })) {
        note(m);
        if (m.type === "result") {
          // The result is the last message that matters. Stop here: a stream that stays open after it (seen once in
          // round 3) must not turn a finished run into a 20-minute timeout.
          result = m;
          break;
        }
      }
    } catch (e) {
      if (!result) return { error: `claude run failed: ${e?.message ?? e}`, metadata: { ...prep, seconds: (Date.now() - t0) / 1000 } };
    } finally {
      clearTimeout(timer);
      // breaking out of the loop closes the query; abort anything still running (MCP server, shells)
      ac.abort();
    }
    if (!result) return { error: "no result message (timeout or abort)", metadata: { ...prep, seconds: (Date.now() - t0) / 1000 } };
    const u = result.usage ?? {};
    const tokensIn = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    const tokensOut = u.output_tokens ?? 0;
    return {
      output: typeof result.result === "string" && result.result ? result.result : `(${result.subtype})`,
      cost: result.total_cost_usd,
      tokenUsage: { total: tokensIn + tokensOut, prompt: tokensIn, completion: tokensOut },
      metadata: { ...prep, turns: result.num_turns, seconds: (result.duration_ms ?? Date.now() - t0) / 1000, costUsd: result.total_cost_usd, subtype: result.subtype, isError: result.is_error },
    };
  }
}
