<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Metatoy LLC -->
# validonce migration evals (Plan C, Part 4b)

A [promptfoo](https://www.promptfoo.dev) harness that measures how well a coding agent migrates hand-written validation to validonce, using the `validonce-migrate` skill and the `validonce-mcp` server. Claude and Copilot run on the same cases with the same scoring. Copilot is measured by hand in VS Code (agent mode, see below); the Copilot CLI provider is optional.

**Local only. Never run `promptfoo share`** (`sharing: false` is set in the config and every script sets `PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_SHARING=1`).

## What is measured

Cases: the five `testbeds/before/*` fixtures (migrate the three Signup rules) and five `testbeds/tricky/*` fixtures (migrate nothing: arithmetic, nested object, coercion, conditional format, async DB). Each fixture's answer is its `expected.json`; it is never copied to the agent. Every case runs 3 times per agent.

Deterministic assertions (`assertions/`): `differential` (the agent's `validonce-rules.json` vs the ORIGINAL validator, via `generate_inputs` and `compare_results`; hard gate), `rules` (recall and precision vs `expected.json`), `keep` (kept checks still hand-written, reason in the report), `scope` (diff against a pristine copy touches only allowed files), `builds` (project still builds or loads), `report` (`MIGRATION_REPORT.md` has the headings of `skills/validonce-migrate/assets/report-template.md`). `metrics` records tokens, cost, credits, turns and seconds as named metrics (weight 0). `rubric` (report clarity, weight 0.1) is **disabled** unless `VALIDONCE_EVAL_RUBRIC=1`, because it calls a model.

Contract given to the agent (`prompt.txt`): do the full migration the skill describes (validonce rules in the fixture's own validator code, duplicates removed, the rest kept hand-written), consent to run the old validator in `.validonce-scratch/`, and write `validonce-rules.json` and `MIGRATION_REPORT.md` in the project root. `scope` allows exactly the fixture's `allowedFiles` (in its `expected.json`: validator source, manifest, the two outputs, `.validonce-scratch/**`).

`builds` also checks that the migrated validator exports the same rules as `validonce-rules.json` where the stack can export: Python (`ValidonceModel.export_rules()`, via `exporters/export_pydantic.py`) and C# (`ValidonceValidator<T>.ExportRules()`, via `exporters/dotnet`). For TypeScript the rules JSON is the source, so it only checks the module still imports.

Offline dependencies in the scratch dirs: npm `validonce` is a link in `node_modules` to the workspace `js/`; Python uses `python/.venv` (pydantic plus the editable workspace `validonce`); C# gets a `nuget.config` pointing at a local feed (`$TMPDIR/validonce-evals/_feed`, packed once from `dotnet/src/Validonce` and `Validonce.FluentValidation`, version 0.2.0). Re-pack by deleting that feed folder after changing the .NET library.

## Free dry run (no model, no credits)

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
pnpm --filter validonce-mcp build          # mcp/dist is what the agents and assertions use
pnpm --filter validonce-mcp-evals dry-run  # replay-good and replay-bad on zod, pydantic, tricky-arithmetic
```

`providers/replay.mjs` applies a recorded migration from `replay/<case>/{good,bad}/` instead of calling an agent. Good must pass everything; bad must fail `differential`.

## Real runs and the budget gate

Real runs spend Claude tokens or Copilot credits. **Set a budget first.** Until then the Claude and Copilot providers (and `run-eval.mjs`) refuse to run. After the budget is set:

```sh
pnpm --filter validonce-mcp-evals matrix            # planned runs and the cost-estimate method; calls nothing
VALIDONCE_EVAL_APPROVED=1 VALIDONCE_EVAL_BUDGET=<amount> pnpm --filter validonce-mcp-evals eval:claude  -- --filter-pattern zod --repeat 1   # pilot
VALIDONCE_EVAL_APPROVED=1 VALIDONCE_EVAL_BUDGET=<amount> pnpm --filter validonce-mcp-evals eval:copilot -- --filter-pattern zod --repeat 1
```

Tokens per run are unknown until a pilot: run one case per agent, read `cost_usd` / `credits` / `tokens_total` from the results, then multiply by the planned run count. `VALIDONCE_EVAL_PLAN_ONLY=1` makes the providers print what they would run (options or the `copilot` command line) without calling anything.

Caps: Claude `maxBudgetUsd` per run (default 5), 60 turns, 20 minute timeout; Copilot 20 minute timeout.

### Variants (tuning)

`SKILL_VARIANT=<name>` selects the skill directory installed in each scratch dir: `baseline` is `skills/validonce-migrate`; any other name is `mcp/evals/variants/<name>/` (a copy of the skill directory with one change), or give an absolute path. Run once per variant and compare; keep a change only if neither agent gets worse (at most 3 rounds). The Part 5 public apps are a hold-out set: never tune on them.

### Copilot in VS Code (manual run)

Copilot agent mode in VS Code is driven by you, not by a script, so the harness only prepares the folders and scores them afterwards. No model is called by any of these scripts.

```sh
cd mcp/evals
node prepare-vscode.mjs                 # default cases: the 5 "before" fixtures, tricky-arithmetic, tricky-async-db
node prepare-vscode.mjs zod pydantic    # or pick cases; EVAL_RUN_ID=<id> picks the run id
```

It prints the run id and one `code <folder>` line per case. Each folder (`$TMPDIR/validonce-evals/vscode/<run-id>/<case>/`) holds the fixture, the skill at `.github/skills/validonce-migrate`, `.vscode/mcp.json` (the `validonce` stdio server from the locally built `mcp/dist/index.js`), the offline dependencies, `PROMPT.md` (the same prompt as `prompt.txt`), `RUN-SHEET.md` and `run.json`. Per case: open the folder in VS Code, switch Copilot Chat to Agent mode, pick the model, paste `PROMPT.md`, allow the `validonce` tools, let the agent finish, then fill `run.json` (`{"model": "", "credits": null, "minutes": null, "notes": ""}`). For a repeat, prepare a fresh run id so every run starts clean. Then score:

```sh
node score-vscode.mjs <run-id>          # runs promptfoo with only the copilot-vscode provider and prints the table
```

`providers/vscode-score.mjs` returns the folder as the working directory and reads cost (credits x $0.01), minutes and model from `run.json`, so the same assertions apply. The pristine copy is kept outside the opened folder (`.score/<case>/`). `node dry-verify-vscode.mjs` checks the whole flow without Copilot: it drops recorded replays into three folders, scores them, and starts the server with the exact command in `.vscode/mcp.json` to run `initialize` and `tools/list`.

### Providers

- `providers/claude.mjs`: the Claude Agent SDK `query()`, the same SDK promptfoo's `anthropic:claude-agent-sdk` wraps. It is a wrapper, not the built-in provider id, because the built-in takes one static `working_dir` per provider entry and this eval needs a fresh scratch dir per call (and the assertions need to find it). Model `opus` by default (`EVAL_CLAUDE_MODEL` overrides). Tools: Read, Edit, Write, Glob, Grep, Bash, Skill and the `validonce` MCP server; sandboxed Bash, no network, `settingSources: ["project"]` so only the scratch dir's skill and `.mcp.json` load (no user settings, hooks or CLAUDE.md).
- `providers/copilot.mjs` (optional; Copilot is normally run in VS Code, above): `copilot -p … --allow-all-tools --disable-builtin-mcps --no-ask-user --output-format json` with deny rules for `git push`, `git commit`, `rm`, `curl`, `wget`, `ssh`, `security`, `sudo`, `--additional-mcp-config @<file>` for `validonce-mcp`, cwd = the scratch dir. No `--allow-all-paths` / `--allow-all-urls`. Credits come from `session.usage_checkpoint.data.totalNanoAiu` (÷ 1e9; 1 credit = $0.01).
- `providers/replay.mjs`: no model; see above.

## Privacy

- Scratch dirs live under `$TMPDIR/validonce-evals/<run-id>/<case>__<variant>__<agent>__<id>/{work,pristine}`; `prepare.mjs` refuses any path inside the repository's parent workspace. Override the root with `EVAL_SCRATCH`.
- Results and promptfoo's own state (`PROMPTFOO_CONFIG_DIR`) go under `$TMPDIR/validonce-evals/results/` and `…/promptfoo-home/` only. Copy a scorecard elsewhere by hand if you want to keep it.
- Only public validonce code (the skill, the MCP server) and the public testbeds reach the agents. `node_modules` and the Python venv are symlinked read-only from the repo; nothing else of the workspace is visible.
- Copilot: turn off "Allow GitHub to use my data for AI model training" in your Copilot settings before running.
