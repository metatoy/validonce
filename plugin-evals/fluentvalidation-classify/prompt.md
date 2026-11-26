---
max_turns: 15
timeout_seconds: 400
tags: [classify, dotnet]
allowed_tools: [Read, Glob, Grep, Skill]
---

Our React form repeats the checks from this ASP.NET Core validator. We'd like to define them once on the server with validonce. Tell me which rules can move and which can't, and draft the ones that can. Don't run or install anything, just answer here. The API serializes property names in camelCase.

```csharp
public class SignupValidator : AbstractValidator<Signup>
{
    public SignupValidator(IUserRepository users)
    {
        RuleFor(x => x.Company).NotEmpty().When(x => x.Plan == "pro");
        RuleFor(x => x.MaxSeats).GreaterThan(x => x.MinSeats);
        RuleFor(x => x.Email).MustAsync(async (email, ct) => !await users.ExistsAsync(email, ct))
            .WithMessage("That email is already registered");
    }
}
```
