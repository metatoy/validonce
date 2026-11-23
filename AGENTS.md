# AGENTS.md

Guidance for coding agents working with validonce, in this repo or in a project that uses it.

## What validonce is

Validation rules that involve more than one field ("company is required when plan is pro", "end is on or after start") written once, on the server, and enforced in the browser from the same rules. The server publishes them in its OpenAPI document under `components.schemas.<Name>["x-validonce"]`; the client reads them from there. The format is in `docs/rule-format-v1.md`; the overview is `docs/how-it-works.md`.

## Where rules are written

| Backend | Write rules in | Guide |
|---|---|---|
| ASP.NET Core | a `ValidonceValidator<T>` (FluentValidation) | `docs/getting-started-aspnet.md` |
| FastAPI | a `ValidonceModel` (Pydantic), with `F` and `when` | `docs/getting-started-fastapi.md` |
| TypeScript / Zod | `withRules(zodSchema)` on the client side, reading the server's rules | `docs/client-react.md`, `docs/client-angular.md` |

Rules always originate on the server. The client only reads them.

## The five rule kinds

`required_when`, `compare`, `at_least_one_of`, `exactly_one_of`, `all_or_none`. Field-level checks (type, length, enum, pattern) are not rules here; they already travel as JSON Schema keywords.

## Do and do not

- **Never hand-write a cross-field rule on the client.** If the rule is missing from the OpenAPI document, add it on the server and let it flow through. A client-only copy drifts from what the server enforces.
- No type coercion: `"1"` is not `1`. Equality is strict and exact (see the rule format).
- A rule that does not fit one of the five kinds stays a hand-written server check; do not bend a kind to fit it.
- Use `server_only: true` for a rule the browser must not run.

## MCP server

`mcp/` is `validonce-mcp` (read-only tools: `read_openapi_rules`, `check_rules`, `evaluate`). Register it with `claude mcp add --transport stdio validonce -- npx -y validonce-mcp`. Use `check_rules` on a proposed rule set before presenting it.

## Running tests

Run heavy commands one at a time.

| Language | Command |
|---|---|
| C# (`dotnet/`) | `cd dotnet && dotnet test -c Release` |
| TypeScript (`js/`) | `pnpm install && cd js && pnpm build && pnpm typecheck && pnpm test && pnpm lint` |
| MCP server (`mcp/`) | after building `js/`: `cd mcp && pnpm build && pnpm typecheck && pnpm test` |
| Python (`python/`) | `cd python && uv run pytest -q && uv run ruff check . && uv run ruff format --check .` |

Cross-language behavior is pinned by `conformance/`; change a rule's meaning in all four languages or none.

## Conventions

Node >= 20 and pnpm. TypeScript is strict. Every source file starts with `SPDX-License-Identifier: Apache-2.0` and `Copyright 2026 Metatoy LLC`. Examples use generic names and `example.test` addresses.
