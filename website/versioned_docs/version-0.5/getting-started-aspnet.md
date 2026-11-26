# Getting started: ASP.NET Core

Write cross-field rules once in FluentValidation. The server enforces them and publishes them in OpenAPI. Needs .NET 10.

## 1. Install

```sh
dotnet add package Validonce.AspNetCore
```

## 2. Write the validator

Derive from `ValidonceValidator<T>`. Ordinary FluentValidation rules (`RuleFor`) work in the same class.

```csharp
using System.Text.Json.Serialization;
using FluentValidation;
using Validonce;
using Validonce.FluentValidation;

public sealed record Signup(
    [property: JsonPropertyName("plan")] string? Plan,
    [property: JsonPropertyName("company")] string? Company,
    [property: JsonPropertyName("email")] string? Email,
    [property: JsonPropertyName("start")] DateOnly? Start,
    [property: JsonPropertyName("end")] DateOnly? End,
    [property: JsonPropertyName("quantity")] int? Quantity);

public sealed class SignupValidator : ValidonceValidator<Signup>
{
    public SignupValidator()
    {
        RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessageKey("rules.company_required");
        Compare(x => x.End, CompareOp.Ge, x => x.Start).WithMessageKey("rules.end_after_start");
        Compare(x => x.Quantity, CompareOp.Ge, 1)
            .WithMessageKey("rules.quantity_min", new Dictionary<string, object?> { ["min"] = 1 });
        RuleFor(x => x.Email).NotEmpty();
    }
}
```

Group rules take two or more properties: `AtLeastOneOf`, `ExactlyOneOf`, `AllOrNone`. `.AtPath(...)` reports the error on another property. `.ServerOnly()` makes clients skip a rule.

## 3. Register

```csharp
using Validonce.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddValidonce();
builder.Services.AddOpenApi(o => o.AddValidonceSchemaTransformer());

var app = builder.Build();
app.MapOpenApi();
app.MapPost("/signups", (Signup s) => Results.Ok(new { ok = true })).WithValidonce();
app.Run();
```

`AddValidonce()` scans the calling assembly. For controllers, call `AddValidonceMvc()` after `AddControllers()`.

## 4. What you get

`GET /openapi/v1.json` has the rules under `components.schemas.Signup["x-validonce"]`.

A request that breaks a rule gets status 422 (change it with `AddValidonce(o => o.ValidationStatusCode = 400)`):

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

`validonce` is the issue list. In the browser, `issuesFromProblemDetails` or `issuesFromResponse` from `validonce/server-errors` turns it back into issues.

## Gotchas

- Field names in the rules are wire names: `[JsonPropertyName]` if present, else the camelCase naming policy. Pass your own `JsonSerializerOptions` to the base constructor if you changed the policy.
- `Compare` infers its type from the property: numbers, `string`, `DateOnly`, `DateTimeOffset`. `DateTime` is rejected because it has no offset; use `DateTimeOffset` for an instant or `DateOnly` for a date. Numbers are compared as doubles, so a `decimal` loses precision beyond about 15 digits.
- Dates travel as ISO strings (`2026-12-01`). Send the same from the browser.
- Validators are singletons. Keep them stateless.
- Rule ids default to `TypeName.kind.wireField` and must be unique per validator. Use `.WithRuleId(...)` on a collision.

Next: the [React guide](client-react.md) or [Angular guide](client-angular.md). Runnable example: [examples/aspnet-app](../examples/aspnet-app/README.md).
