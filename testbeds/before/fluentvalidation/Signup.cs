// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Signup rules as a hand-written FluentValidation validator (no validonce).
using FluentValidation;

namespace Before;

public sealed record Signup(
    string? Plan,
    string? Company,
    string? Email,
    DateOnly? Start,
    DateOnly? End,
    int? Quantity);

public sealed class SignupValidator : AbstractValidator<Signup>
{
    public SignupValidator()
    {
        RuleFor(x => x.Plan).Must(p => p is "free" or "pro");
        RuleFor(x => x.Email).NotEmpty();
        RuleFor(x => x.Start).NotNull();
        RuleFor(x => x.Quantity).NotNull();
        RuleFor(x => x.Company).Must(c => !string.IsNullOrEmpty(c)).When(x => x.Plan == "pro");
        RuleFor(x => x.End).GreaterThanOrEqualTo(x => x.Start).When(x => x.End.HasValue && x.Start.HasValue);
        RuleFor(x => x.Quantity).GreaterThanOrEqualTo(1).When(x => x.Quantity.HasValue);
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
