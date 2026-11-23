# Changelog

All notable changes to validonce. Versions follow semantic versioning; before 1.0, minor versions may include breaking changes.

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
