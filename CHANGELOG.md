# Changelog

All notable changes to validonce. Versions follow semantic versioning; before 1.0, minor versions may include breaking changes.

## 0.1.0 (unreleased)

First public release: the regex portability linter.

- **`Validonce.Cli`** (dotnet tool, command `validonce`): `validonce lint-regex <openapi.json>` checks every `pattern` in an OpenAPI or JSON Schema document; `--pattern` checks one pattern. Options `--engines`, `--fail-on`, `--format text|json`. `validonce findings` lists the table.
- **`Validonce`** (library): `Validonce.Patterns.PatternLinter.Lint(pattern)` with the same 25 findings, plus the rule-format v1 types and evaluator.
- Findings cover five engines: JavaScript with and without the `u` flag, Python `re`, Rust `regex` (Pydantic's default) and .NET. All are verified against the real engines in CI.

Not yet released (built and tested in this repository, planned for 0.2): FluentValidation and ASP.NET Core integration, the TypeScript runtime with Zod support, and the Pydantic and FastAPI integration.
