# Validonce.FluentValidation

Write cross-field validation rules once, in FluentValidation. The server enforces them, and the same rules
export as data in the validonce rule format, so clients can evaluate them too.

## Install

```
dotnet add package Validonce.FluentValidation
```

For ASP.NET Core, install `Validonce.AspNetCore` instead. It brings this package and `Validonce`.

## Example

```csharp
using FluentValidation;
using Validonce;
using Validonce.FluentValidation;

public sealed record Signup(string? Plan, string? Company, DateOnly? Start, DateOnly? End, string? Email, string? Phone);

public sealed class SignupValidator : ValidonceValidator<Signup>
{
    public SignupValidator()
    {
        RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessageKey("rules.company_required");
        Compare(x => x.End, CompareOp.Ge, x => x.Start).WithMessageKey("rules.end_after_start");
        AtLeastOneOf(x => x.Email, x => x.Phone).WithMessageKey("rules.contact_required");
        RuleFor(x => x.Email).EmailAddress();   // ordinary FluentValidation rules work alongside
    }
}

var result = new SignupValidator().Validate(new Signup("pro", null, null, null, null, null));
// result.Errors: ErrorCode is the message key, CustomState is the Validonce Issue.

var ruleData = new SignupValidator().ExportRules().ToJson();   // the value of x-validonce
```

## Rules

- `RequiredWhen(field, condition)` with `If.Eq / Ne / In / Present / Absent / All / Any / Not`.
- `Compare(left, op, right)` against another property or a constant: numbers, `string`, `DateOnly`, `DateTimeOffset`.
- `AtLeastOneOf`, `ExactlyOneOf` and `AllOrNone` over two or more properties. `.AtPath(...)` reports on another property.
- Every rule takes `.WithMessageKey(...)`, `.WithRuleId(...)`, `.ServerOnly()` and `.WithMessage(...)`.

Field names in the rule data are wire names: `[JsonPropertyName]` if present, otherwise the naming policy of the
`JsonSerializerOptions` you pass to the base constructor (default camelCase).

The rule format is described at https://github.com/metatoy/validonce/blob/main/docs/rule-format-v1.md.
Source and issues: https://github.com/metatoy/validonce.

Copyright 2026 Metatoy LLC. Licensed under the Apache License, Version 2.0.
