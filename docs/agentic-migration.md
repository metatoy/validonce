# Migrating an existing project with an agent

Moving an existing project to validonce means finding every hand-written cross-field check, deciding which rule kind each one is, rewriting it once on the server, deleting the client copies, and checking that nothing changed on generated inputs. A coding agent can do most of that with two pieces from this repo:

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

### VS Code and GitHub Copilot

One click: [Install in VS Code](vscode:mcp/install?%7B%22name%22%3A%22validonce%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22validonce-mcp%22%5D%7D) (opens VS Code and asks you to confirm). Or add `.vscode/mcp.json` to the project:

```json
{
  "servers": {
    "validonce": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "validonce-mcp"]
    }
  }
}
```

Then pick **Agent** mode in Copilot Chat and enable the `validonce` tools. Workspace folders are passed to the server as its roots.

### Cursor

Add `.cursor/mcp.json` (or `~/.cursor/mcp.json` for every project):

```json
{
  "mcpServers": {
    "validonce": {
      "command": "npx",
      "args": ["-y", "validonce-mcp"]
    }
  }
}
```

### Any other MCP client (generic stdio)

Run `npx -y validonce-mcp` as a stdio server (Node 20 or later). The command is `npx`, the arguments are `-y validonce-mcp`, and there is nothing to configure: it needs no network, no API key and no environment variables. A client that sends no workspace roots gets the directory the server was started in.

The server works with any MCP client. For other agents that read Agent Skills, copy `skills/validonce-migrate/` into the folder your agent reads skills from, and add the server with your agent's MCP configuration. We only claim **support** for agents that pass the graded evals (see "What has been tested" below); the configurations above are "works with any MCP client", not a support claim.

## What happens

1. **Inventory.** The agent finds cross-field checks: FluentValidation `When`/`Must`/`GreaterThanOrEqualTo(x => x.Other)`, Pydantic `@model_validator`, Zod `refine`/`superRefine`, Angular group validators, yup `.when`/`.test`, go-playground/validator tags, Jakarta Bean Validation, class-validator, Joi `.when`/`.custom`, VeeValidate. Kubernetes CRDs with CEL (`x-kubernetes-validations`) take a separate path: `translate_kubernetes` translates them and leaves the CEL as it is.
2. **Classify.** Each check becomes one of the five rule kinds, or stays hand-written with a one-line reason. Arithmetic between fields, a format that depends on another field, async or database checks, rules on nested objects, and comparisons that rely on type coercion stay hand-written.
3. **Propose and check.** The agent writes the rules and runs `check_rules` against your OpenAPI schema (field names, types, duplicate ids).
4. **Generate.** `generate_code` writes the server code for the target you pick: C# (`ValidonceValidator<T>`), Python (`ValidonceModel`), Go (`validonce.MustBuild`), Java (a `RuleDefinition<T>` with `@ValidonceRules`) or TypeScript (`defineRules` with a Fastify or NestJS schema), and the client wiring (`withRules`, react-hook-form, Angular, Vue, plain HTML). `suggest_client_wiring` returns the set-up for React, Angular, Vue or plain HTML, including the kubb, Hey API and orval plugin configs, the dependent-field helpers and the server-error mapping. The Go, Java, TypeScript, Vue and plain HTML targets, `translate_kubernetes` and `suggest_client_wiring` need `validonce-mcp` 0.2.0 or later.
5. **Prove.** `generate_inputs` creates test inputs biased toward the edges the rules care about: every combination of blank and filled fields, equal values, ±1, date edges and time-zone offsets. With your consent, the agent runs your **old** validator on them with a runner script (scripts in `skills/validonce-migrate/scripts/`; the sandbox each one has is listed under Safety). Kubernetes CRDs have no old validator to run: the CEL stays in place and `translate_kubernetes` reports, per rule, whether it was translated or kept as `server_only`. `compare_results` compares the old answers with validonce's.
6. **Migrate only what passed.** A rule is migrated only when the old and new validators accept and reject exactly the same inputs, and the rule was triggered both ways often enough to count.
7. **Report and hand over.** The agent writes a migration report (found, migrated, proven, kept and why, the commands to re-run the proof) and leaves the diff for you.

## Safety

- **The server never runs your code.** Its tools take structured input and return data. One tool, `generate_inputs`, can write one new `.jsonl` file inside your project, and never overwrites a file.
- **Your old validator runs only with your consent,** through the runner scripts, in a scratch directory:
  - **Node (Zod, yup, Angular):** runs in `node --permission` with an empty environment and network APIs removed. Any import that needs I/O fails with a clear message, and the bundled `require` allows only the two pure builtins `url` and `util`; any other `require` throws.
  - **Python (Pydantic):** runs with `python -I` and sockets disabled.
  - **.NET (FluentValidation):** loads your built assembly. A validator that needs injected services is reported as "cannot prove", not guessed.
  - **Node, class-validator and Joi:** the same `node --permission` runner as Zod, yup and Angular, with `class-validator`, `class-transformer`, `reflect-metadata` or `joi` added to the allowed imports.
  - **Go (go-playground/validator):** a small Go program (its module needs Go 1.26.10) that you build with your struct and run with `go run`. It has no sandbox of its own: it opens no connections itself, but your validators are your code.
  - **Java (Jakarta Bean Validation):** one Java file launched on a plain JDK 21 against Hibernate Validator. It has no sandbox of its own, and a validator that needs injected beans is reported as "cannot prove".

  The runners are tripwires, not full sandboxes, and the Go and Java runners are not even that. For a hard network block, run any of them under `sandbox-exec` (macOS) or `unshare -n` (Linux).
- **File contents are treated as data.** The skill tells the agent to ignore instructions found in code, comments or docs.

## Limits

- **Only the five rule kinds.** Everything else stays hand-written, which is expected.
- **Where an error is reported.** A Pydantic `model_validator` that raises without naming a field is reported at `__root__`. The verdict (accept or reject) is still exact, but the agent decides which field the error belongs on by reading the code.
- **Inputs must parse.** Inputs that your model would reject at parse time are reported separately, not as rule differences.
- **Wire names.** Rules use the names in the JSON body. Where the old validator reports a different name (a class-validator property with `@Expose({ name })`, a Java property renamed by Jackson), the paths can differ and show up as field-location warnings, not as accept/reject differences. The Jakarta and Go runners map to wire names; the class-validator runner does not (see `references/class-validator.md`).
- **Runner scope.** The class-validator runner bundles with `experimentalDecorators` and no decorator metadata, so a DTO that needs `emitDecoratorMetadata` must state its types explicitly. The Joi runner uses Joi's defaults (type conversion on, unknown keys rejected). VeeValidate has no rule engine of its own, so the runner proves the yup or Zod schema it hosts, not the Vue component.

## What has been tested

The proof tools and runners are tested in CI on hand-written versions of the Signup example for FluentValidation, Pydantic, Zod, yup and Angular: each matches validonce on every test input. Agent results are measured with [promptfoo](https://www.promptfoo.dev) (harness in `mcp/evals`), and support for a given agent is claimed here only after it passes that evaluation.

Every run is graded by code, not by a model: the agent's rules must accept and reject exactly what the old validator did on thousands of generated inputs, the migrated validator as a whole must agree with the original, every check that cannot be migrated must still be there with a reason, the project must still build, and only the expected files may change.

| Agent | Tuning set (10 cases: our examples in five libraries, plus five that must not be migrated) | Hold-out (three public apps, measured once: .NET/FluentValidation, FastAPI/Pydantic, React/Zod) |
|---|---|---|
| Claude Code (Opus) | 30 of 30 runs pass every check | 6 of 9 pass every check; the other 3 migrated less than they could (rules left hand-written, with reasons) |
| GitHub Copilot CLI (GPT-5.3-Codex) | 7 of 7 | 2 of 3; one left code that did not import (caught by the build check) |

Of 49 graded runs (final tuning round and hold-out), 45 passed every check (43 as first run; two rescored after a timeout and a build failure), and in those the old and migrated validators agreed on every generated input. In a later check with other inputs, 9 of the 28 passing runs that migrated rules changed a verdict on at least one, mostly dates held as plain text. Supported: **Claude Code**. Copilot's results are reported as measured.

### Go, Java, NestJS, Joi, Vue and Kubernetes

The newer sources were graded later, the same way, with Claude Code. Copilot has not been measured on them yet.

| Agent | Tuning set (10 cases: go-playground, Jakarta, class-validator, Joi, VeeValidate and a Kubernetes CRD, plus four that must not be migrated) | Date cases (yup, Angular, NestJS and Joi with dates checked at runtime; the proof includes malformed and partial dates) | Hold-out (one public Vue/VeeValidate app, measured once) |
|---|---|---|---|
| Claude Code (Opus) | 18 of 20 pass every check; both misses are Joi runs that kept a date rule hand-written | 6 of 7; the miss migrated correctly but added a file it was not asked for | 1 of 1 |
| Claude Code (Sonnet) | not run | 4 of 4 (one run per case) | not measured |

In the passing tuning runs the old and migrated validators agreed on every generated input. In a later check with other inputs, 11 of the 13 passing runs that migrated rules changed a verdict on at least one, mostly malformed or partial dates in the NestJS and Vue cases, and years 0000 or above 9999 in Go and Spring. The date cases put such inputs in the proof itself, and none of their passing runs changed a verdict.
