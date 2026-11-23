// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using FluentValidation;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
using Validonce.FluentValidation;

namespace Validonce.AspNetCore;

/// <summary>Adds <c>x-validonce</c> to the schema of every type that has a <see cref="ValidonceValidator{T}"/> registered.</summary>
public sealed class ValidonceSchemaTransformer : IOpenApiSchemaTransformer
{
    /// <summary>The OpenAPI extension name: <c>x-validonce</c>.</summary>
    public const string ExtensionName = "x-validonce";

    /// <inheritdoc />
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        // Property-position schemas of the same type are references to the component; annotate the type itself once.
        if (context.JsonPropertyInfo is not null) return Task.CompletedTask;
        var type = context.JsonTypeInfo.Type;
        var validator = context.ApplicationServices.GetService(typeof(IValidator<>).MakeGenericType(type));
        if (validator is IRuleExporter exporter)
        {
            schema.Extensions ??= new Dictionary<string, IOpenApiExtension>();
            schema.Extensions[ExtensionName] = new JsonNodeExtension(exporter.ExportRules().ToJson());
        }
        return Task.CompletedTask;
    }
}
