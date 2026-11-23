// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Reflection;
using FluentValidation;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Validonce.FluentValidation;

namespace Validonce.AspNetCore;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers every <see cref="ValidonceValidator{T}"/> in the assemblies (default: the calling assembly)
    /// as a singleton <c>IValidator&lt;T&gt;</c>. Validators must be stateless.
    /// </summary>
    public static IServiceCollection AddValidonce(this IServiceCollection services, params Assembly[] assemblies)
        => services.AddValidonce(null, assemblies.Length == 0 ? new[] { Assembly.GetCallingAssembly() } : assemblies);

    public static IServiceCollection AddValidonce(
        this IServiceCollection services, Action<ValidonceOptions>? configure, params Assembly[] assemblies)
    {
        var options = new ValidonceOptions();
        configure?.Invoke(options);
        services.TryAddSingleton(options);
        foreach (var asm in assemblies.Length == 0 ? new[] { Assembly.GetCallingAssembly() } : assemblies)
            foreach (var t in asm.GetTypes().Where(t => t is { IsAbstract: false, IsGenericTypeDefinition: false }))
                if (ModelOf(t) is { } model)
                    services.TryAddSingleton(typeof(IValidator<>).MakeGenericType(model), t);
        return services;
    }

    /// <summary>Registers one validator as a singleton <c>IValidator&lt;T&gt;</c>.</summary>
    public static IServiceCollection AddValidonceValidator<T, TValidator>(this IServiceCollection services)
        where TValidator : ValidonceValidator<T>
    {
        services.TryAddSingleton(new ValidonceOptions());
        services.AddSingleton<IValidator<T>, TValidator>();
        return services;
    }

    /// <summary>Adds <c>x-validonce</c> to the schemas of types that have a registered validator.</summary>
    public static OpenApiOptions AddValidonceSchemaTransformer(this OpenApiOptions options)
        => options.AddSchemaTransformer<ValidonceSchemaTransformer>();

    private static Type? ModelOf(Type t)
    {
        for (var b = t.BaseType; b is not null; b = b.BaseType)
            if (b.IsGenericType && b.GetGenericTypeDefinition() == typeof(ValidonceValidator<>))
                return b.GetGenericArguments()[0];
        return null;
    }
}
