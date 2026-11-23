// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Replay: the Signup rules migrated to ValidonceValidator (the cross-field checks are now exported rules).
using FluentValidation;
using Validonce.FluentValidation;
using Validonce;

namespace Before;

public sealed record Signup(
    string? Plan,
    string? Company,
    string? Email,
    DateOnly? Start,
    DateOnly? End,
    int? Quantity);

public sealed class SignupValidator : ValidonceValidator<Signup>
{
    public SignupValidator()
    {
        RuleFor(x => x.Plan).Must(p => p is "free" or "pro");
        RuleFor(x => x.Email).NotEmpty();
        RuleFor(x => x.Start).NotNull();
        RuleFor(x => x.Quantity).NotNull();
        RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessageKey("rules.company_required");
        Compare(x => x.End, CompareOp.Gt, x => x.Start).WithMessageKey("rules.end_after_start");
        Compare(x => x.Quantity, CompareOp.Ge, 1).WithMessageKey("rules.quantity_min", new Dictionary<string, object?> { ["min"] = 1 });
    }
}

public interface IClock { DateOnly Today { get; } }

/// <summary>Needs an injected service: the runner must report "cannot prove" (exit 4).</summary>
public sealed class NeedsServicesValidator : AbstractValidator<Signup>
{
    public NeedsServicesValidator(IClock clock)
    {
        RuleFor(x => x.Start).Must(s => s >= clock.Today);
    }
}
