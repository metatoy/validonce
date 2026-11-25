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

public sealed record Contact(
    [property: JsonPropertyName("email")] string? Email,
    [property: JsonPropertyName("phone")] string? Phone,
    [property: JsonPropertyName("street")] string? Street,
    [property: JsonPropertyName("city")] string? City,
    [property: JsonPropertyName("postalCode")] string? PostalCode,
    [property: JsonPropertyName("country")] string? Country,
    [property: JsonPropertyName("availableFrom")] DateOnly? AvailableFrom,
    [property: JsonPropertyName("availableTo")] DateOnly? AvailableTo);

// playground:begin
public sealed class ContactValidator : ValidonceValidator<Contact>
{
    private static readonly string[] Countries = ["US", "CA", "GB", "other"];

    public ContactValidator()
    {
        // Rule order is part of the contract (examples/CONTRACT.md).
        AtLeastOneOf(x => x.Email, x => x.Phone).WithMessageKey("rules.contact_email_or_phone");
        AllOrNone(x => x.Street, x => x.City, x => x.PostalCode).WithMessageKey("rules.address_all_or_none");
        RequiredWhen(x => x.PostalCode, If.Eq(x => x.Country, "US")).WithMessageKey("rules.postal_code_required_us");
        Compare(x => x.AvailableTo, CompareOp.Ge, x => x.AvailableFrom).WithMessageKey("rules.available_to_after_from");

        RuleFor(x => x.Email).EmailAddress().When(x => !string.IsNullOrEmpty(x.Email));
        RuleFor(x => x.Phone).Matches(@"^\+?[0-9 ()-]{7,20}$").When(x => !string.IsNullOrEmpty(x.Phone));
        RuleFor(x => x.Country).NotEmpty().Must(c => c is null || Countries.Contains(c)).WithMessage("Country must be one of US, CA, GB, other.");
    }
}
// playground:end
