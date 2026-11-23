// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Validonce.AspNetCore;

/// <summary>
/// An MVC action filter that validates action arguments with the registered <c>IValidator&lt;T&gt;</c>s and
/// answers failures with the same ProblemDetails as <c>WithValidonce</c>: <c>errors</c> and a top-level
/// <c>validonce</c> issue list. Register it with <c>AddValidonceMvc()</c>.
/// </summary>
public sealed class ValidonceActionFilter : IAsyncActionFilter
{
    /// <inheritdoc />
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var http = context.HttpContext;
        var failures = new List<ValidationFailure>();
        foreach (var parameter in context.ActionDescriptor.Parameters)
        {
            if (!context.ActionArguments.TryGetValue(parameter.Name, out var arg) || arg is null) continue;
            var validatorType = typeof(IValidator<>).MakeGenericType(parameter.ParameterType);
            if (http.RequestServices.GetService(validatorType) is not IValidator validator) continue;
            var result = await validator.ValidateAsync(new ValidationContext<object>(arg), http.RequestAborted);
            failures.AddRange(result.Errors);
        }
        if (failures.Count == 0)
        {
            await next();
            return;
        }
        var problem = ValidonceProblem.CreateDetails(failures, http);
        var objectResult = new ObjectResult(problem) { StatusCode = problem.Status };
        objectResult.ContentTypes.Add("application/problem+json");
        context.Result = objectResult;
    }
}
