// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// promptfoo provider that calls NO model. It prepares the scratch dir exactly as a real run would, then applies a
// recorded migration (mcp/evals/replay/<case>/<mode>/ overlaid on the working directory) so the
// assertions can be tested end to end for free. mode = "good" | "bad" (config.mode).
// A file named "<name>.delete" in a replay dir deletes <name>. MIGRATION_REPORT.md is built from the
// template's headings when the replay dir has "MIGRATION_REPORT.md.tmpl" (placeholders: {{HEADINGS}}).
import { cpSync, existsSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { prepare } from "../prepare.mjs";
import { evalsDir, reportHeadings } from "../lib/util.mjs";

function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, base) : [p.slice(base.length + 1)];
  });
}

/** Overlays replay/<case>/<mode>/ on a working directory. */
export function applyReplay(work, caseId, mode) {
  const dir = join(evalsDir, "replay", caseId, mode);
  if (!existsSync(dir)) throw new Error(`no replay recorded for ${caseId}/${mode}`);
    for (const f of walk(dir)) {
      const dest = join(work, f.replace(/\.tmpl$/, "").replace(/\.delete$/, ""));
      if (f.endsWith(".delete")) { rmSync(dest, { force: true }); continue; }
      mkdirSync(dirname(dest), { recursive: true });
      if (f.endsWith(".tmpl")) {
        const hs = reportHeadings().headings;
        const body = readFileSync(join(dir, f), "utf8");
        writeFileSync(dest, body.replace("{{HEADINGS}}", hs.map((h) => `## ${h}\n\nSee the sections above and the rule set in validonce-rules.json.\n`).join("\n")));
      } else cpSync(join(dir, f), dest);
    }
}

export default class ReplayProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
    this.providerId = options.id ?? `replay-${this.config.mode ?? "good"}`;
  }
  id() {
    return this.providerId;
  }
  async callApi(_prompt, context) {
    const vars = context?.vars ?? {};
    const mode = this.config.mode ?? "good";
    const t0 = Date.now();
    const prep = prepare({ caseId: vars.case, variant: vars.variant ?? "baseline", agent: "replay" });
    const dir = join(evalsDir, "replay", vars.case, mode);
    if (!existsSync(dir)) return { error: `no replay recorded for ${vars.case}/${mode}`, metadata: prep };
    applyReplay(prep.work, vars.case, mode);
    return {
      output: `replay ${mode}: applied ${vars.case}/${mode}`,
      cost: 0,
      tokenUsage: { total: 0, prompt: 0, completion: 0 },
      metadata: { ...prep, turns: 0, seconds: (Date.now() - t0) / 1000, costUsd: 0 },
    };
  }
}
