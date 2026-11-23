# validonce for .NET

Write cross-field validation rules once, in FluentValidation. The server enforces them, and the same rules are
published as data in your OpenAPI document (`x-validonce`) so clients can evaluate them too.

Copyright 2026 Metatoy LLC. Apache-2.0.

## Install

```
dotnet add package Validonce.AspNetCore        # brings Validonce.FluentValidation and Validonce
```

## Write a validator

```csharp
public sealed record Signup(string? Plan, string? Company, DateOnly? Start, DateOnly? End, int? Quantity, string? Email);

public sealed class SignupValidator : ValidonceValidator<Signup>
{
    public SignupValidator()
    {
        RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessageKey("rules.company_required");
        Compare(x => x.End, CompareOp.Ge, x => x.Start).WithMessageKey("rules.end_after_start");
        Compare(x => x.Quantity, CompareOp.Ge, 1).WithMessageKey("rules.qty_min");
        RuleFor(x => x.Email).NotEmpty();   // ordinary FluentValidation rules work alongside
    }
}
```

- Conditions: `If.Eq / Ne / In / Present / Absent / All / Any / Not`.
- Field names in the rule data are wire names: `[JsonPropertyName]` if present, otherwise the naming policy of the
  `JsonSerializerOptions` (default camelCase). Pass your own options to the base constructor.
- The compare type comes from the property type: numbers, `string`, `DateOnly` (date), `DateTimeOffset` (datetime).
  `DateTime` is rejected because it has no offset.
- Rule ids default to `TypeName.kind.wireField` and must be unique per validator; override with `.WithRuleId(...)`.
  `.ServerOnly()` makes clients skip a rule.

### Group rules

```csharp
AtLeastOneOf(x => x.Email, x => x.Phone).WithMessageKey("rules.contact_required");   // fails when all are blank
ExactlyOneOf(x => x.Card, x => x.Invoice).WithMessageKey("rules.one_payment");       // fails unless exactly one is set
AllOrNone(x => x.Street, x => x.City, x => x.Postcode).WithMessageKey("rules.address_complete");
```

Each takes two or more distinct sibling properties. The default id is `TypeName.kind.firstWireField` and the
issue is reported on the first field; `.AtPath(x => x.Contact)` reports it on another property. `.WithRuleId`,
`.ServerOnly()` and `.WithMessageKey(key, params)` work as for the other rules.

## Register and use

```csharp
builder.Services.AddValidonce();                                   // scans this assembly, singleton IValidator<T>
builder.Services.AddOpenApi(o => o.AddValidonceSchemaTransformer());

app.MapOpenApi();
app.MapPost("/signups", (Signup s) => Results.Ok()).WithValidonce();
```

For MVC controllers, call `builder.Services.AddValidonceMvc()` after `AddControllers()`; the `ValidonceActionFilter` it adds returns the same 422 body.

## What you get

OpenAPI: the schema of `Signup` gains

```json
"x-validonce": { "version": 1, "rules": [
  { "id": "Signup.required_when.company", "kind": "required_when", "field": "company",
    "when": { "eq": { "field": "plan", "value": "pro" } }, "message": { "key": "rules.company_required" } } ] }
```

A failing request gets status 422 (`options.ValidationStatusCode` changes it) with ProblemDetails:

```json
{ "title": "One or more validation errors occurred.", "status": 422,
  "errors": { "Company": ["rules.company_required"] },
  "validonce": [ { "path": ["company"], "ruleId": "Signup.required_when.company",
                   "key": "rules.company_required", "params": {} } ] }
```

`validonce` is the same issue list the client evaluators produce. Inside FluentValidation each issue is a
`ValidationFailure` whose `ErrorCode` is the key and `CustomState` is the `Issue`.
