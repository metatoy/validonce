// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Serialization;
using Validonce;
using Validonce.FluentValidation;
using FluentValidation;

namespace AspNetApp;

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
        Compare(x => x.Quantity, CompareOp.Ge, 1).WithMessageKey("rules.quantity_min", new Dictionary<string, object?> { ["min"] = 1 });
        RuleFor(x => x.Email).NotEmpty();
    }
}
