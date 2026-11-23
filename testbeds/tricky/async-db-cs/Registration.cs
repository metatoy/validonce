// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Tricky fixture: an async database uniqueness check. validonce rules are pure functions of the payload,
// so the agent must keep this.
using FluentValidation;

namespace Tricky;

public sealed record Registration(string? Email, string? DisplayName);

public interface IUserRepository
{
    Task<bool> EmailExistsAsync(string email, CancellationToken ct);
}

public sealed class RegistrationValidator : AbstractValidator<Registration>
{
    public RegistrationValidator(IUserRepository users)
    {
        RuleFor(x => x.Email)
            .MustAsync(async (email, ct) => email is null || !await users.EmailExistsAsync(email, ct))
            .WithMessage("Email is already registered");
    }
}
