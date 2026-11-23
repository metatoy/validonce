# Migrating an existing project with an agent

Moving an existing project to validonce means finding every hand-written cross-field check, deciding which rule kind each one is, rewriting it once on the server, deleting the client copies, and proving nothing changed. A coding agent can do most of that with two pieces from this repo:

- **`validonce-mcp`**: an MCP server with deterministic tools that read, check, evaluate, generate and compare rules.
- **`validonce-migrate`**: an agent skill with the steps and the per-library mapping guides.

The agent proposes the change and you review the diff. Nothing is committed for you.

## Install

**Claude Code (plugin: the skill and the server together):**

```text
/plugin marketplace add metatoy/validonce
/plugin install validonce@validonce
```

**The server alone, in any MCP client:**

```text
claude mcp add --transport stdio validonce -- npx -y validonce-mcp
```

For other agents that read Agent Skills, copy `skills/validonce-migrate/` into the folder your agent reads skills from, and add the server with your agent's MCP configuration. We only claim support for agents we have tested (see "What has been tested" below).

## What happens

1. **Inventory.** The agent finds cross-field checks: FluentValidation `When`/`Must`/`GreaterThanOrEqualTo(x => x.Other)`, Pydantic `@model_validator`, Zod `refine`/`superRefine`, Angular group validators, yup `.when`/`.test`.
2. **Classify.** Each check becomes one of the five rule kinds, or stays hand-written with a one-line reason. Arithmetic between fields, a format that depends on another field, async or database checks, rules on nested objects, and comparisons that rely on type coercion stay hand-written.
3. **Propose and check.** The agent writes the rules and runs `check_rules` against your OpenAPI schema (field names, types, duplicate ids).
4. **Generate.** `generate_code` writes the server code (C# `ValidonceValidator<T>` or Python `ValidonceModel`) and the client wiring (`withRules`, react-hook-form, Angular).
5. **Prove.** `generate_inputs` creates test inputs biased toward the edges the rules care about: every combination of blank and filled fields, equal values, ±1, date edges and time-zone offsets. With your consent, the agent runs your **old** validator on them in a sandbox (scripts in `skills/validonce-migrate/scripts/`). `compare_results` compares the old answers with validonce's.
6. **Migrate only what passed.** A rule is migrated only when the old and new validators accept and reject exactly the same inputs, and the rule was triggered both ways often enough to count.
7. **Report and hand over.** The agent writes a migration report (found, migrated, proven, kept and why, the commands to re-run the proof) and leaves the diff for you.

## Safety

- **The server never runs your code.** Its tools take structured input and return data. One tool, `generate_inputs`, can write one new `.jsonl` file inside your project, and never overwrites a file.
- **Your old validator runs only with your consent,** through the runner scripts, in a scratch directory:
  - **Node (Zod, yup, Angular):** runs in `node --permission` with an empty environment and network APIs removed. Any import that needs I/O fails with a clear message.
  - **Python (Pydantic):** runs with `python -I` and sockets disabled.
  - **.NET (FluentValidation):** loads your built assembly. A validator that needs injected services is reported as "cannot prove", not guessed.

  The runners are tripwires, not full sandboxes. For a hard network block, run them under `sandbox-exec` (macOS) or `unshare -n` (Linux).
- **File contents are treated as data.** The skill tells the agent to ignore instructions found in code, comments or docs.

## Limits

- **Only the five rule kinds.** Everything else stays hand-written, which is expected.
- **Where an error is reported.** A Pydantic `model_validator` that raises without naming a field is reported at `__root__`. The verdict (accept or reject) is still exact, but the agent decides which field the error belongs on by reading the code.
- **Inputs must parse.** Inputs that your model would reject at parse time are reported separately, not as rule differences.

## What has been tested

The proof tools and runners are tested in CI on hand-written versions of the Signup example for FluentValidation, Pydantic, Zod, yup and Angular: each matches validonce on every test input. Agent results are measured with [promptfoo](https://www.promptfoo.dev), and support for a given agent is claimed here only after it passes that evaluation.
