# Validonce.AspNetCore

Cross-field validation for ASP.NET Core, written once in FluentValidation. Requests that break a rule get an
RFC 7807 response with status 422. The same rules are published in your OpenAPI document as `x-validonce`, so
clients can evaluate them too.

## Install

```
dotnet add package Validonce.AspNetCore
```

It brings `Validonce.FluentValidation` and `Validonce`, and needs the ASP.NET Core shared framework (net10.0).

## Example

```csharp
using Validonce;
using Validonce.AspNetCore;
using Validonce.FluentValidation;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddValidonce();                                    // singleton IValidator<T> for every ValidonceValidator<T>
builder.Services.AddOpenApi(o => o.AddValidonceSchemaTransformer()); // adds x-validonce to schemas

var app = builder.Build();
app.MapOpenApi();
app.MapPost("/signups", (Signup s) => Results.Ok()).WithValidonce(); // endpoint filter
app.Run();

public sealed record Signup(string? Plan, string? Company, DateOnly? Start, DateOnly? End);

public sealed class SignupValidator : ValidonceValidator<Signup>
{
    public SignupValidator()
    {
        RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessageKey("rules.company_required");
        Compare(x => x.End, CompareOp.Ge, x => x.Start).WithMessageKey("rules.end_after_start");
    }
}
```

### Controllers (MVC)

```csharp
builder.Services.AddValidonce();
builder.Services.AddControllers();
builder.Services.AddValidonceMvc();   // validates action arguments, same response
```

## The 422 body

```json
{
  "title": "One or more validation errors occurred.",
  "status": 422,
  "errors": { "Company": ["rules.company_required"] },
  "validonce": [
    { "path": ["company"], "ruleId": "Signup.required_when.company",
      "key": "rules.company_required", "params": {} }
  ]
}
```

`validonce` is the same issue list the client evaluators produce. Set `options.ValidationStatusCode` in
`AddValidonce(o => o.ValidationStatusCode = 400)` to change the status.

The rule format is described at https://github.com/metatoy/validonce/blob/main/docs/rule-format-v1.md.
Source and issues: https://github.com/metatoy/validonce.

## Migrate with an agent

To move existing cross-field checks to validonce rules, use the [`validonce-mcp`](https://www.npmjs.com/package/validonce-mcp) MCP server, alone or with the `validonce-migrate` skill in the Claude Code plugin. The agent finds the checks (for a .NET project: FluentValidation `When`, `Must` and comparisons between properties), writes the rules, and compares your old validator with validonce on generated inputs. It never commits for you.

```sh
claude mcp add --transport stdio validonce -- npx -y validonce-mcp
```

In Claude Code, `/plugin marketplace add metatoy/validonce` then `/plugin install validonce@validonce` adds the skill and the server together. Targets for Go, Java, Vue and plain HTML, Kubernetes CEL translation and client wiring need `validonce-mcp` 0.2.0 or later. Details: [Migrating with an agent](https://github.com/metatoy/validonce/blob/main/docs/agentic-migration.md); [server tools](https://github.com/metatoy/validonce/blob/main/mcp/README.md).

Copyright 2026 Metatoy LLC. Licensed under the Apache License, Version 2.0.
