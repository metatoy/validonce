# FluentValidation (C#) to validonce

Target: `ValidonceValidator<T>` from `Validonce.FluentValidation` (a subclass of `AbstractValidator<T>`; your `RuleFor` field rules keep working beside the cross-field ones). Run the old validator with `scripts/dotnet-runner/`. Ground truth: `testbeds/before/fluentvalidation/Signup.cs`.

Wire names: rules use the JSON names the API serializes (`[JsonPropertyName]`, else camelCase by default). Pass `propertyNames` to `generate_code` when a property's wire name is not the camelCase of its name. The runner needs the same naming (`--naming camel|none`).

## Before to after, per kind

### required_when

```csharp
// before
RuleFor(x => x.Company).Must(c => !string.IsNullOrEmpty(c)).When(x => x.Plan == "pro");
RuleFor(x => x.Company).NotEmpty().When(x => x.Plan == "pro");
```
```csharp
// after (in a ValidonceValidator<Signup> constructor)
RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessageKey("rules.company_required");
```

Other conditions: `x.Plan != "free"` is `If.Ne`, `x.Plan is "a" or "b"` is `If.In(x => x.Plan, "a", "b")`, `!string.IsNullOrEmpty(x.Phone)` is `If.Present`, `string.IsNullOrEmpty(x.Phone)` is `If.Absent`, `&&` / `||` / `!` are `If.All` / `If.Any` / `If.Not`.

### compare (two fields)

```csharp
// before
RuleFor(x => x.End).GreaterThanOrEqualTo(x => x.Start).When(x => x.End.HasValue && x.Start.HasValue);
```
```csharp
// after
Compare(x => x.End, CompareOp.Ge, x => x.Start).WithMessageKey("rules.end_after_start");
```

The `.When(... HasValue ...)` guard is exactly what `compare` does by itself (it passes when either side is blank), so it disappears. Without the guard FluentValidation is asymmetric: a null *left* side passes, but a set left side compared with a null right side **fails**. validonce passes in both cases, so an unguarded comparison is a different behaviour: keep requiredness as its own rule or leave the check hand-written.

### compare (constant)

```csharp
// before
RuleFor(x => x.Quantity).GreaterThanOrEqualTo(1).When(x => x.Quantity.HasValue);
// after
Compare(x => x.Quantity, CompareOp.Ge, 1).WithMessageKey("rules.quantity_min", new Dictionary<string, object?> { ["min"] = 1 });
```

Operators: `LessThan` `Lt`, `LessThanOrEqualTo` `Le`, `GreaterThan` `Gt`, `GreaterThanOrEqualTo` `Ge`, `Equal` `Eq`, `NotEqual` `Ne`. The compare type comes from the property type: numbers, `string`, `DateOnly`, `DateTimeOffset`. `DateTime` is rejected (no offset): switch the model to `DateTimeOffset` or `DateOnly` (an API change; ask first) or keep the rule hand-written.

### at_least_one_of / exactly_one_of / all_or_none

```csharp
// before
RuleFor(x => x).Must(x => !string.IsNullOrEmpty(x.Email) || !string.IsNullOrEmpty(x.Phone));
RuleFor(x => x).Must(x => (x.Card is not null) ^ (x.Invoice is not null));
RuleFor(x => x).Must(x => new[] { x.Street, x.City, x.Zip }.All(string.IsNullOrEmpty) || new[] { x.Street, x.City, x.Zip }.All(s => !string.IsNullOrEmpty(s)));
```
```csharp
// after
AtLeastOneOf(x => x.Email, x => x.Phone).WithMessageKey("rules.contact_required");
ExactlyOneOf(x => x.Card, x => x.Invoice).WithMessageKey("rules.pay_one");
AllOrNone(x => x.Street, x => x.City, x => x.Zip).AtPath(x => x.Street).WithMessageKey("rules.address_all");
```

`.AtPath(...)` sets where the error lands (default: the first field). `.AtPath(...)` is also available on `RequiredWhen(...)` and `Compare(...)` (it needs a validonce version with that support).

### Options

`.WithRuleId("Signup.compare.end")`, `.ServerOnly()`, `.WithMessage("text")` (server text only; not exported).

## Traps

- **`GreaterThan` vs `GreaterThanOrEqualTo`** (and `Less...`): off by one value. The differential check catches it at the equal boundary; check the old operator name twice.
- **"" vs null after model binding.** With JSON bodies (System.Text.Json, minimal APIs and `[FromBody]`), a missing property binds as `null` and `""` stays `""`; with form posts (`[FromForm]`) MVC turns `""` into `null`. Both are blank in validonce, but `" "` is **not** blank. `NotEmpty()` treats `" "` (whitespace) as empty; `string.IsNullOrEmpty` does not; `IsNullOrWhiteSpace` does. If the old code treats whitespace as empty, validonce differs: keep that rule hand-written (the check will show it).
- **Default values.** `NotEmpty()` on a non-nullable value type such as `int` rejects its default (`0`), while on `int?` it rejects only `null`; on a string it rejects `null`, `""` and whitespace; on a collection, an empty one. validonce never treats `0` as blank. Check each property's type before translating `NotEmpty`.
- **Cascade and conditions.** `.When(c)` by default applies to **every** validator already in that `RuleFor` chain (`ApplyConditionTo.AllValidators`), not only the last one; `.When(c, ApplyConditionTo.CurrentValidator)` limits it. Split a chain accordingly before translating. `.Unless(c)` is `If.Not(c)`.
- **String comparison.** FluentValidation's `Equal` on strings is ordinal and case-sensitive by default, as is validonce's (code point, no case folding, no culture). If the old code passes a `StringComparer` (`OrdinalIgnoreCase`, culture), case-insensitive equality does not map.
- **Decimals and doubles.** validonce compares numbers as IEEE doubles. Two `decimal` values that differ only beyond double precision (`9007199254740993m` vs `9007199254740992m`) are different in C# but equal in a validonce rule: keep such a check hand-written.
- **Rules inside `RuleForEach`, `SetValidator`, child validators** are nested/cross-object: keep hand-written (or move the rule to the child's own validator).
- **Services**: a validator whose constructor needs injected services (`IClock`, a DbContext) exits 4 in the runner: "cannot prove"; keep hand-written.
- **Error field**: FluentValidation reports `PropertyName` of the `RuleFor`; the runner maps it to the wire name. A rule that adds an error on another property than the compared one needs an explicit `path` (`.AtPath`).
- **`RuleFor(x => x.Quantity).NotNull()`, `Must(p => p is "free" or "pro")`**: field-level, not cross-field. Leave them (or express the enum as JSON Schema).
