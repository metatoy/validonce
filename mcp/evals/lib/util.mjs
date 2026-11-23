// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const evalsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(evalsDir, "../..");
/** The parent workspace of this repo: may hold other private projects, so never an agent's working directory. */
export const parentWorkspace = resolve(repoRoot, "..");
export const mcpEntry = join(repoRoot, "mcp/dist/index.js");
export const skillsDir = join(repoRoot, "skills/validonce-migrate");
export const testbeds = join(repoRoot, "testbeds");

export const scratchRoot = () => join(process.env.EVAL_SCRATCH ?? join(tmpdir(), "validonce-evals"));

export function assertOutsideParentWorkspace(p) {
  const r = resolve(p);
  if (r === parentWorkspace || r.startsWith(parentWorkspace + sep))
    throw new Error(`refusing to use ${r}: it is inside the parent workspace (${parentWorkspace}). Scratch dirs must be under $TMPDIR.`);
  return r;
}

export const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
export const ensureDir = (p) => (mkdirSync(p, { recursive: true }), p);

/** Heading texts required in MIGRATION_REPORT.md: the "## " headings of the skill's report template. */
export const DEFAULT_REPORT_HEADINGS = ["Summary", "Migrated rules", "Left hand-written", "Differential check", "Changes made"];
export function reportHeadings() {
  const p = join(skillsDir, "assets/report-template.md");
  if (!existsSync(p)) return { headings: DEFAULT_REPORT_HEADINGS, source: "fallback (skills/validonce-migrate/assets/report-template.md not found yet)" };
  const hs = [...readFileSync(p, "utf8").matchAll(/^#{2,3}\s+(.+?)\s*$/gm)].map((m) => m[1].replace(/[*_`]/g, "").trim());
  return { headings: hs.length ? hs : DEFAULT_REPORT_HEADINGS, source: p };
}

export function requireApproval(what) {
  if (process.env.VALIDONCE_EVAL_APPROVED !== "1")
    throw new Error(`${what} spends model tokens or Copilot credits. Budget gate: set a budget first; then run with VALIDONCE_EVAL_APPROVED=1 (see mcp/evals/README.md).`);
}

/**
 * Local NuGet feed with the workspace's Validonce and Validonce.FluentValidation (0.2.0), packed once per scratch root,
 * so a scratch C# project can add the dependency offline. Each pack is a heavy dotnet command; callers run one at a time.
 */
export function ensureNugetFeed() {
  const feed = join(scratchRoot(), "_feed");
  if (existsSync(join(feed, "Validonce.FluentValidation.0.2.0.nupkg")) && existsSync(join(feed, "Validonce.0.2.0.nupkg"))) return feed;
  mkdirSync(feed, { recursive: true });
  for (const p of ["Validonce", "Validonce.FluentValidation"]) {
    const r = spawnSync("dotnet", ["pack", join(repoRoot, "dotnet/src", p), "-c", "Release", "-o", feed, "-v", "q", "-nologo"], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`dotnet pack ${p} failed: ${(r.stdout + r.stderr).slice(-500)}`);
  }
  return feed;
}

/** The rule exporter console app (references dotnet/src/Validonce.FluentValidation); built once per scratch root. */
export function ensureDotnetExporter() {
  const out = join(scratchRoot(), "_exporter-2"); // bump the suffix when exporters/dotnet changes
  if (existsSync(join(out, "Exporter.dll"))) return join(out, "Exporter.dll");
  const r = spawnSync("dotnet", ["build", join(evalsDir, "exporters/dotnet"), "-c", "Release", "-o", out, "-v", "q", "-nologo"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`exporter build failed: ${(r.stdout + r.stderr).slice(-500)}`);
  return join(out, "Exporter.dll");
}
