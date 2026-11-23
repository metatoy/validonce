// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Linq.Expressions;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Validonce.FluentValidation;

/// <summary>Resolves C# members to wire names and C# values to rule-format values.</summary>
internal sealed class WireNames(JsonSerializerOptions options)
{
    public JsonSerializerOptions Options { get; } = options;

    public string WireName(PropertyInfo p) =>
        p.GetCustomAttribute<JsonPropertyNameAttribute>()?.Name
        ?? Options.PropertyNamingPolicy?.ConvertName(p.Name)
        ?? p.Name;

    /// <summary>A direct property of T: <c>x =&gt; x.Prop</c> (a boxing/lifting cast is allowed).</summary>
    public PropertyInfo Property<T, TProp>(Expression<Func<T, TProp>> expr)
    {
        var body = expr.Body;
        while (body is UnaryExpression { NodeType: ExpressionType.Convert or ExpressionType.ConvertChecked } u) body = u.Operand;
        if (body is MemberExpression { Member: PropertyInfo p } m && m.Expression == expr.Parameters[0])
            return p;
        throw new ArgumentException(
            $"'{expr}' must select a property of {typeof(T).Name} directly (x => x.Prop). " +
            "A v1 rule refers only to fields of the object it is attached to.", nameof(expr));
    }

    /// <summary>A value serialized the way the wire would carry it: string, number or boolean.</summary>
    public JsonNode Scalar<TValue>(TValue value)
    {
        if (value is null) throw new ArgumentException("a rule value cannot be null; use Absent/Present instead");
        var node = JsonSerializer.SerializeToNode(value, typeof(TValue), Options);
        return node is JsonValue v && v.GetValueKind() is JsonValueKind.String or JsonValueKind.Number
            or JsonValueKind.True or JsonValueKind.False
            ? node
            : throw new ArgumentException($"value of type {typeof(TValue).Name} does not serialize to a string, number or boolean");
    }
}
