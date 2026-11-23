# Validonce

Write validation rules once on the server and enforce them everywhere. This package is the core library for .NET.

Version 0.1 contains:

- **The regex pattern linter** (`Validonce.Patterns`). It finds regular expressions that behave differently in
  JavaScript, Python, Rust and .NET, so a `pattern` in your OpenAPI document does not pass on one side and fail on the other.
- **The rule-format evaluator** (`Validonce`). It evaluates validonce rule sets (`RuleSet`) against JSON data.

The FluentValidation and ASP.NET Core packages (`Validonce.FluentValidation`, `Validonce.AspNetCore`) come in a later release.

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
