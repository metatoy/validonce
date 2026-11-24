# Changelog

All notable changes to validonce. Versions follow semantic versioning; before 1.0, minor versions may include breaking changes.

## 0.3.2 (2026-11-24)

### Added
- The rule format has a permanent home: https://schemas.metatoy.com/validonce/. The schemas' `$id`s are now their canonical URLs: `rules-v1.json` (the value of `x-validonce`), `conformance-case-v1.json` and `regex-case-v1.json`. Evaluators never fetch them.
- `rules-file-v1.json`: the schema of a standalone rules file (`validonce extract --format json`), conventionally named `*.validonce.json`. The CLI help and the TypeScript README say how to get editor validation for it.
- `x-validonce` is declared as a JSON Schema 2020-12 vocabulary (`https://schemas.metatoy.com/validonce/vocab/rules-v1`), with a dialect, `dialect-v1.json`, for OpenAPI 3.1's `jsonSchemaDialect`. Using it is opt-in. See "Using the validonce dialect" in `docs/rule-format-v1.md`.

### In the repository, not in the packages
- `validonce-mcp` 0.1.1 is published on npm (the MCP server for migrating existing validation to validonce); 0.1.0 could not be installed and is deprecated. Agent evaluation results, including a hold-out set of three public apps, are in `docs/agentic-migration.md`.

### Release process
- Every GitHub Release now carries the packages it published: the four `.nupkg` files and the Python wheel and sdist, each with a GitHub build provenance attestation. Check a download with `gh attestation verify <file> -R metatoy/validonce`. nuget.org re-signs the packages it serves, so verify the copy attached to the Release, not one downloaded from nuget.org.
- `scripts/prepare-release.mjs <version>` sets the version everywhere it lives (C#, TypeScript, Python, the demo chart, the bug-report template), turns this "Unreleased" heading into the release heading and refreshes `uv.lock`.
- The name-holding placeholder packages and their publish path are gone.

## 0.3.1 (2026-11-24)

### Fixed
- TypeScript and Python: the rule parsers now check conditions and compare rules the way the C# parser and the format schema already did. A malformed condition (for example `{ "op": "eq", "field": "plan", "value": "pro" }` instead of `{ "eq": { "field": "plan", "value": "pro" } }`), an unknown `op` or `type`, or a `right` side with both or neither of `field` and `value` is now a format error when the rules are loaded. Before, it passed parsing and failed later, or the rule silently never fired.
- TypeScript and Python: a compare constant must be a string or a number. A boolean constant used to pass parsing and then make the rule skip every input.

### Docs
- Correction to 0.3.0: the NuGet build provenance attestation covers the `.nupkg` our release workflow built. nuget.org re-signs every package it serves, so a copy downloaded from nuget.org does not verify with `gh attestation verify`. Attaching the built packages to the GitHub Release, so there is a copy that does verify, is planned.

### In the repository, not yet published
- `validonce-mcp`: `generate_inputs` produces well-typed inputs by default (`properties` and the new `required` list; real calendar dates; formats inside `anyOf`), keeps each rule's boundary cases when other rules have required fields, and the `validonce-migrate` skill is tuned from agent evaluations (Claude and Copilot).

## 0.3.0 (2026-11-23)

### Added
- TypeScript: `validonce wrap` attaches a server's `x-validonce` rules to the Zod schemas that orval or kubb generate, writing a companion module. It matches exports by schema name (including FastAPI's `Signup-Input`), fails at generation time on unknown fields, ambiguous or unmatched schemas, and takes `--map` and `--style`. Recipes for orval's `afterAllFilesWrite` hook and for kubb are in the README; both run in CI against real generator output.
- TypeScript: `isoDate()` and `isoDateTime()` in `validonce/zod`: Zod date and datetime schemas that accept exactly what validonce's `date` and `datetime` types and the servers accept (`z.iso.date()` also allows year `0000`).
- C#: `.AtPath(...)` on `RequiredWhen` and `Compare` (as on the group rules), so every rule kind can report on another property. `RequiredWhen` and `Compare` now return `RuleBuilder<T>` (a subclass of `ValidonceRuleBuilder`).
- NuGet packages ship with a build provenance attestation; check one with `gh attestation verify <file>.nupkg -R metatoy/validonce`. (npm packages carry npm provenance and PyPI packages trusted-publishing attestations, as before.)
- A one-click GitHub Codespaces demo (ASP.NET backend and React form); the example forms now call their backend through a same-origin `/api` proxy.

### Docs
- README and `docs/how-it-works.md` use the diagram from metatoy.com (rendered by `scripts/render-diagram.mjs`); a security policy (`SECURITY.md`) with private vulnerability reporting.
- New: how validonce compares with the alternatives (`docs/comparison.md`), loading rules at runtime (`docs/live-rules.md`), and a README demo GIF recorded by `scripts/record-demo.mjs`.
- Rule format: year `0000` is not a valid `date` (Zod's `z.iso.date()` accepts it); use `isoDate()`.

### In the repository, not yet published
- `validonce-mcp` (an MCP server) and the `validonce-migrate` agent skill and Claude Code plugin, for migrating existing hand-written validation to validonce with a differential proof. They will be released separately after agent evaluation. See `docs/agentic-migration.md`.

## 0.2.0 (2026-11-22)

### Added
- Rule kinds `at_least_one_of`, `exactly_one_of` and `all_or_none` in all three evaluators (C#, TypeScript, Python), with 30 new shared conformance cases (125 in total).
- C#: `AtLeastOneOf`, `ExactlyOneOf` and `AllOrNone` builders on `ValidonceValidator<T>`, with `.AtPath(...)` to report on another property.
- Python: `at_least_one_of`, `exactly_one_of` and `all_or_none` builders for `ValidonceModel`.
- C#: XML documentation for every public type and member in the four packages, shipped with each package.
- C#: NuGet package READMEs for `Validonce.FluentValidation` and `Validonce.AspNetCore`; the `Validonce` README covers the evaluator and the group kinds.
- C#: MVC support in `Validonce.AspNetCore`. `AddValidonceMvc()` adds `ValidonceActionFilter`, which validates controller action arguments and returns the same 422 ProblemDetails with the top-level `validonce` member. `ValidonceProblem.CreateDetails` builds that body.

- TypeScript: `validonce/messages` (`formatMessage`, default text per rule kind), `validonce/react-hook-form` (`dependentFields`, `registerDeps`), `validonce/angular` (`validonceGroupValidator` for Reactive Forms; Signal Forms work through `validateStandardSchema` with `withRules`), and the `validonce extract` command that writes the rules from an OpenAPI document as a typed module.

### Breaking (Validonce library)
- `UnsupportedRule` is removed; group rules are now `GroupRule` with a `Fields` list, and they evaluate instead of throwing.

## 0.1.0 (2026-11-22)

First public release: the regex portability linter.

- **`Validonce.Cli`** (dotnet tool, command `validonce`): `validonce lint-regex <openapi.json>` checks every `pattern` in an OpenAPI or JSON Schema document; `--pattern` checks one pattern. Options `--engines`, `--fail-on`, `--format text|json`. `validonce findings` lists the table.
- **`Validonce`** (library): `Validonce.Patterns.PatternLinter.Lint(pattern)` with the same 25 findings, plus the rule-format v1 types and evaluator.
- Findings cover five engines: JavaScript with and without the `u` flag, Python `re`, Rust `regex` (Pydantic's default) and .NET. All are verified against the real engines in CI.

Not yet released (built and tested in this repository, planned for 0.2): FluentValidation and ASP.NET Core integration, the TypeScript runtime with Zod support, and the Pydantic and FastAPI integration.
