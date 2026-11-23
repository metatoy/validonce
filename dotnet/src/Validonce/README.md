# Validonce

Write validation rules once on the server and enforce them everywhere. This package is the core library for .NET.

This package contains:

- **The regex pattern linter** (`Validonce.Patterns`). It finds regular expressions that behave differently in
  JavaScript, Python, Rust and .NET, so a `pattern` in your OpenAPI document does not pass on one side and fail on the other.
- **The rule-format evaluator** (`Validonce`). `RuleSet.Parse` reads validonce rules and `Evaluator.Evaluate` runs them against JSON data. The rule kinds are `required_when`, `compare`, and the group kinds `at_least_one_of`, `exactly_one_of` and `all_or_none`.

To write the rules in FluentValidation and serve them from ASP.NET Core, use `Validonce.FluentValidation` and `Validonce.AspNetCore`.

## Evaluate rules

```csharp
using System.Text.Json.Nodes;
using Validonce;

var rules = RuleSet.Parse(xValidonceJson);   // the x-validonce value from an OpenAPI schema
var data = JsonNode.Parse("""{"email":null,"phone":null}""")!.AsObject();
foreach (var issue in Evaluator.Evaluate(rules.Rules, data))
    Console.WriteLine($"{string.Join('.', issue.Path)} {issue.Key}");
```

Pass `EvaluationSide.Client` to skip rules marked server-only.

## Lint a pattern

```csharp
using Validonce.Patterns;

foreach (var f in PatternLinter.Lint(@"^\w+$"))
{
    Console.WriteLine($"{f.Id} {f.Severity} at {f.Start}: {f.Message}");
    if (f.Rewrite is not null) Console.WriteLine($"  suggested: {f.Rewrite}");
}

// Only care about some engines:
var options = new LintOptions(new HashSet<Engine> { Engine.Js, Engine.DotNet });
var findings = PatternLinter.Lint(@"^\d+$", options);
```

Engines: `Js`, `JsU` (the `u` flag), `PythonRe`, `RustRegex` (Pydantic's default), `DotNet`. All use search semantics.
`PatternLinter.Findings` lists every finding the linter can report.
The full table is at https://github.com/metatoy/validonce/blob/main/docs/regex-findings.md.

To lint a whole OpenAPI document from the command line, install the `Validonce.Cli` tool:
`dotnet tool install -g Validonce.Cli`.

Copyright 2026 Metatoy LLC. Licensed under Apache-2.0.
