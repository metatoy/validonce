# validonce-mcp

An [MCP](https://modelcontextprotocol.io) server for [validonce](https://github.com/metatoy/validonce): shared validation rules, written once on the server and enforced on the client. It lets a coding agent read the rules an API already publishes, check a proposed rule set, try rules on sample payloads, and prove a migration with a differential check.

## Install

Claude Code:

```sh
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

We claim support only for agents that pass the graded evals; the configurations above work with any MCP client.

## Tools

| Tool | What it does |
|---|---|
| `read_openapi_rules` | Lists the rules (`x-validonce`) per schema in an OpenAPI JSON document, and the schemas that have none. Each schema with rules also gets `generatorNames`: the export names the kubb (`signupSchema`), Hey API (`zSignup`) and orval (`Signup`) styles would match. Input: `path` (a file inside the roots) or `document`. |
| `check_rules` | Checks a rule set: format, duplicate ids, field names and `compare` types against a schema's `properties` (given directly, or as `document` + `schemaName`). Malformed rules come back as problems, never as a crash. |
| `evaluate` | Runs a rule set on sample payloads and returns the issues per payload. `side` is `server` (default) or `client`. |
| `generate_inputs` | Deterministic, boundary-biased wire-JSON inputs for a rule set: the full blank/non-blank matrix per rule (blank = missing, `null`, `""`, `[]`), near-blank non-blanks (`" "`, `0`, `false`, `{}`), `compare` pair coupling (equal, ±1 unit, `Z` vs `+00:00`, offsets, extra fraction digits), `required_when` value coupling (exact and near misses such as case or a trailing space), conformance-suite seeds, then `count` random inputs (default 10,000, max 50,000) for a `seed`. Returns the matrix size and random count. |
| `compare_results` | Compares an old validator's results (`{accept, paths[], error?}` per input, same order) with validonce's on the same inputs. Returns PASS/FAIL, divergences, field-location warnings, old-validator errors, per-rule coverage and a Markdown `report`. |
| `generate_code` | Source text for a rule set. `target`: `csharp` (a model and a `ValidonceValidator<T>` using `RequiredWhen`, `Compare`, `If.*`, `AtLeastOneOf`, `ExactlyOneOf`, `AllOrNone`), `python` (a `ValidonceModel` with `__rules__` from `F`, `when`, `at_least_one_of`...), `zod` (`withRules`), `react-hook-form` (`withRules` + `registerDeps`), `angular-reactive` (`validonceGroupValidator`), `go` (a struct with json tags plus a `validonce.MustBuild[T]` rule set using `When`, `Cmp`, `AtLeastOneOf`...; notes cover Huma `humaonce` and go-playground), `java` (a record plus a `RuleDefinition` class using the `RuleSetBuilder` fluent API and `@ValidonceRules`; notes cover Kotlin), `typescript-rules` (`defineRules` with the `validonce/rules` builders and a Fastify TypeBox schema or a NestJS DTO; `framework: "fastify" | "nestjs"`), `vue` (a vee-validate composable with `toVeeSchema(withRules(...))` + `watchDependents`, and a single-file component), `dom` (`attachRules(form, rules)` and the matching form markup). Targets that write several files also return them in `files`. Names: PascalCase for C# (a `[JsonPropertyName]` is added when needed) and Go (json tags), camelCase for Java (`@JsonProperty` when the name differs), the wire name or snake_case plus an alias for Python; override with `propertyNames` or `naming`. Types come from `properties` / `document` + `schemaName`, else from the rules. Rules the builders cannot express are listed in `unexpressible` and written as comments. Read-only. |
| `translate_kubernetes` | Translates `x-kubernetes-validations` (CEL) in a CRD manifest or a Kubernetes OpenAPI v3 document into validonce rules, without rewriting the CEL. Input: `path` (a JSON file inside the roots) or `document`. Returns the augmented document (omitted, with a per-schema `schemas` summary, when very large), the message `catalog`, and a per-rule `report`: `translated` or `server_only`, with the reason. Read-only. |
| `suggest_client_wiring` | Deterministic, copy-ready client snippets from the docs. Input: `frontend` (`react`, `angular`, `vue`, `dom`), optional `generator` (`kubb`, `hey-api`, `orval`), optional `schemaName`. With a generator: the plugin config, the one import change and the export name. Without: `rulesFromOpenApi` + `withRules` (or `validonceGroupValidator`, `attachRules`). Always adds the dependent-field helper (`registerDeps`, `watchDependents`) and the server 422 error mapping. No network, no file writes. |

All results are structured JSON, capped at 200,000 characters.

### The differential check

1. `generate_inputs` with `outFile` writes the inputs as JSONL.
2. The agent runs the old validator on that file (with a runner script, in its own shell) and writes one `{accept, paths, error?}` line per input.
3. `compare_results` with `inputsPath` and `oldResultsPath` returns the verdict and the report.

The old validator should run **only the migrated rules**; its other checks (required, format) would show as divergences. By default the generator stays inside the type and format checks (no `"2023-02-29"`, no string where a number belongs): the rules pass such values by design and field-level validation catches them. Set `includeInvalid` to add them.

**What must hold:** accept/reject identical on every input (hard gate); a different error field is a warning (fix it with an explicit `path`); messages are ignored; an old validator that throws is its own class (`error`), never counted as a reject, and fails the verdict unless `maxOldErrors` allows it. Every rule must fail and pass at least `floor` times (default 20), otherwise the verdict is FAIL with "not exercised". `minInputs` defaults to 10,000.

**Shrinking.** The server never runs your code, so it cannot re-run the old validator on smaller inputs. Instead it reports divergences sorted by size (fewest keys, then shortest), the smallest diverging input per rule, and the keys present in every diverging input. Because the matrix and coupling generate minimal inputs (only the rule's own fields), the first counterexample is usually already minimal, e.g. `{"start":"2024-06-15","end":"2024-06-15"}` for `gt` written instead of `ge`.

### Generated code is checked

`mcp/test/golden/run.sh` (CI: `codegen.yml`) generates C# and Python for the Signup rules and every distinct rule set in `conformance/rules/`, compiles the C# (against `Validonce.FluentValidation`) and imports the Python, exports the rules from both, and asserts they equal the input. Every rule round-trips; if a future rule cannot be written with the builders, `generate_code` lists it in `unexpressible`.

`mcp/test/golden/run-targets.sh` (CI: `codegen.yml`, job `golden-targets`) does the same for `go`, `java`, `typescript-rules` (Fastify and NestJS), `vue` and `dom`, over the Signup and Contact contracts and every distinct conformance rule set. The generated code is compiled (`go build` and `go vet` in a temp module that `replace`s `../../go`; `javac` through the `codegen-golden` Gradle project against `validonce-core` and `validonce-spring`; `tsc`; `vue-tsc` on the generated `.vue` component), run, and the exported rule sets are compared with the input as JSON. Today every rule round-trips for every target (66 rules per target), so nothing is unexpressible; the check prints any rule that is.

## The read-only promise

- Every tool except `generate_inputs` (`generate_code`, `translate_kubernetes` and `suggest_client_wiring` included) is marked `readOnlyHint: true`. The server runs no commands, opens no network connections, and never executes your code.
- `generate_inputs` has one write, and only when you pass `outFile`: it creates one **new** `.jsonl` file inside the roots, never overwrites (exclusive create), never creates directories, and resolves symlinks first. It is not read-only (`readOnlyHint: false`, `destructiveHint: false`) because 10,000 inputs are far too large for a tool result or for an agent's context. Without `outFile` it is read-only in effect and returns small sets inline.
- Paths are checked against the client's `roots` (symlinks resolved). Anything outside is rejected. A client that sends no roots gets the directory the server was started in.
- Files are read only as JSON or JSONL (at most 5 MB for OpenAPI documents, 64 MB for input and result files). File contents are never echoed back as text; the tools return parsed rule data and findings only.

## License

Apache-2.0, Copyright 2026 Metatoy LLC.
