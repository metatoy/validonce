// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;
using FluentValidation;
using FluentValidation.Results;

namespace Validonce.AspNetCore;

public static class ValidonceEndpointExtensions
{
    /// <summary>
    /// Validates every handler argument that has a registered <c>IValidator&lt;T&gt;</c> and answers failures with
    /// RFC 7807 ProblemDetails carrying <c>errors</c> and <c>validonce</c> (the issue list).
    /// </summary>
    public static TBuilder WithValidonce<TBuilder>(this TBuilder builder) where TBuilder : IEndpointConventionBuilder
        => builder.AddEndpointFilterFactory((factory, next) =>
        {
            var isService = factory.ApplicationServices.GetRequiredService<IServiceProviderIsService>();
            var targets = factory.MethodInfo.GetParameters()
                .Select((p, i) => (p, i))
                .Where(x => isService.IsService(typeof(IValidator<>).MakeGenericType(x.p.ParameterType)))
                .Select(x => (Index: x.i, Validator: typeof(IValidator<>).MakeGenericType(x.p.ParameterType)))
                .ToArray();
            if (targets.Length == 0) return next;
            return async ctx =>
            {
                var failures = new List<ValidationFailure>();
                foreach (var (index, validatorType) in targets)
                {
                    var arg = ctx.Arguments[index];
                    if (arg is null) continue;
                    var validator = (IValidator)ctx.HttpContext.RequestServices.GetRequiredService(validatorType);
                    var result = await validator.ValidateAsync(
                        new ValidationContext<object>(arg), ctx.HttpContext.RequestAborted);
                    failures.AddRange(result.Errors);
                }
                return failures.Count == 0 ? await next(ctx) : ValidonceProblem.Create(failures, ctx.HttpContext);
            };
        });
}

public static class ValidonceProblem
{
    /// <summary>The issues Validonce rules produced, in evaluation order.</summary>
    public static IReadOnlyList<Issue> Issues(IEnumerable<ValidationFailure> failures) =>
        failures.Select(f => f.CustomState).OfType<Issue>().ToList();

    public static IResult Create(IEnumerable<ValidationFailure> failures, HttpContext http)
    {
        var list = failures.ToList();
        var errors = list.GroupBy(f => f.PropertyName)
            .ToDictionary(g => g.Key, g => g.Select(f => f.ErrorMessage).ToArray());
        var status = (http.RequestServices.GetService<ValidonceOptions>() ?? new ValidonceOptions()).ValidationStatusCode;
        var problem = new HttpValidationProblemDetails(errors)
        {
            Status = status,
            Title = "One or more validation errors occurred.",
        };
        var issues = new JsonArray();
        foreach (var i in Issues(list)) issues.Add(i.ToJson());
        problem.Extensions["validonce"] = issues;
        return TypedResults.Problem(problem);
    }
}
