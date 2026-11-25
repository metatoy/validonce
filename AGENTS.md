# AGENTS.md

Guidance for coding agents working with validonce, in this repo or in a project that uses it.

## What validonce is

Validation rules that involve more than one field ("company is required when plan is pro", "end is on or after start") written once, on the server, and enforced in the browser from the same rules. The server publishes them in its OpenAPI document under `components.schemas.<Name>["x-validonce"]`; the client reads them from there. The format is in `docs/rule-format-v1.md`; the overview is `docs/how-it-works.md`.

## Where rules are written

| Backend | Write rules in | Guide |
|---|---|---|
| ASP.NET Core | a `ValidonceValidator<T>` (FluentValidation) | `docs/getting-started-aspnet.md` |
| FastAPI | a `ValidonceModel` (Pydantic), with `F` and `when` | `docs/getting-started-fastapi.md` |
| Fastify | `defineRules` from `validonce/rules`, with a TypeBox schema | `docs/getting-started-fastify.md` |
| NestJS | `@ValidonceRules` on a DTO | `docs/getting-started-nestjs.md` |
| Go | `validonce.MustBuild[T]`, with Huma or go-playground/validator | `docs/getting-started-go.md` |
| Spring Boot | a `RuleDefinition<T>` with `@ValidonceRules` | `docs/getting-started-spring.md` |
| Kubernetes | the CRD's CEL rules, translated (`validonce k8s`), not rewritten | `docs/kubernetes.md` |

On the client, `withRules(zodSchema)` reads the server's rules: `docs/client-react.md`, `docs/client-angular.md`, `docs/client-vue.md`, `docs/client-dom.md`, `docs/client-codegen.md`.

Rules always originate on the server. The client only reads them.

## The five rule kinds

`required_when`, `compare`, `at_least_one_of`, `exactly_one_of`, `all_or_none`. Field-level checks (type, length, enum, pattern) are not rules here; they already travel as JSON Schema keywords.

## Do and do not

- **Never hand-write a cross-field rule on the client.** If the rule is missing from the OpenAPI document, add it on the server and let it flow through. A client-only copy drifts from what the server enforces.
- No type coercion: `"1"` is not `1`. Equality is strict and exact (see the rule format).
- A rule that does not fit one of the five kinds stays a hand-written server check; do not bend a kind to fit it.
- Use `server_only: true` for a rule the browser must not run.

## MCP server and skill

`mcp/` is `validonce-mcp`. Register it with `claude mcp add --transport stdio validonce -- npx -y validonce-mcp`. Eight tools; all are read-only except `generate_inputs` with `outFile`, which creates one new `.jsonl` file inside the workspace roots and never overwrites:

- `read_openapi_rules`: the rules per schema in an OpenAPI JSON document.
- `check_rules`: format, duplicate ids, field names and `compare` types. Use it on a proposed rule set before presenting it.
- `evaluate`: run a rule set on sample payloads, as the server or the client.
- `generate_inputs`: boundary-biased test inputs for a rule set (the one tool that can write a file).
- `compare_results`: compare an old validator's results with validonce's on the same inputs.
- `generate_code`: source for a rule set (C#, Python, Zod, react-hook-form, Angular, Go, Java, TypeScript `defineRules`, Vue, plain HTML).
- `translate_kubernetes`: translate `x-kubernetes-validations` (CEL) in a CRD or Kubernetes OpenAPI document into rules.
- `suggest_client_wiring`: copy-ready client snippets for React, Angular, Vue or plain HTML, with the kubb, Hey API or orval config.

The tools added after 0.1.1 (`translate_kubernetes`, `suggest_client_wiring`, and the Go, Java, `typescript-rules`, Vue and plain HTML targets of `generate_code`) need `validonce-mcp` 0.2.0 or later.

`skills/validonce-migrate/` is the agent skill that uses these tools to migrate existing checks and prove the result. Its per-library guides are in `skills/validonce-migrate/references/`; see `docs/agentic-migration.md`. The Claude Code plugin in `.claude-plugin/` bundles the skill and the server.

## Running tests

Run heavy commands one at a time.

| Language | Command |
|---|---|
| C# (`dotnet/`) | `cd dotnet && dotnet test -c Release` |
| TypeScript (`js/`) | `pnpm install && cd js && pnpm build && pnpm typecheck && pnpm test && pnpm lint` |
| MCP server (`mcp/`) | after building `js/`: `cd mcp && pnpm build && pnpm typecheck && pnpm test` |
| Go (`go/`) | `cd go && go test ./... && go vet ./...` |
| Java (`java/`) | `cd java && ./gradlew check` |
| Python (`python/`) | `cd python && uv run pytest -q && uv run ruff check . && uv run ruff format --check .` |

Cross-language behavior is pinned by `conformance/`; change a rule's meaning in every language or none.

## Conventions

Node >= 20 and pnpm. TypeScript is strict. Every source file starts with `SPDX-License-Identifier: Apache-2.0` and `Copyright 2026 Metatoy LLC`. Examples use generic names and `example.test` addresses.
