// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json;
using System.Text.Json.Nodes;

namespace Validonce;

public abstract record Condition
{
    public abstract bool Evaluate(JsonObject data);

    public static Condition Parse(JsonNode? node)
    {
        if (node is not JsonObject o || o.Count != 1)
            throw new ValidonceFormatException("a condition must be an object with exactly one key");
        var (op, body) = o.First();
        switch (op)
        {
            case "eq": return new Eq(FieldName(body), Scalar(Req(body, "value")));
            case "ne": return new Ne(FieldName(body), Scalar(Req(body, "value")));
            case "in":
                if (Req(body, "values") is not JsonArray vs || vs.Count == 0)
                    throw new ValidonceFormatException("'in' needs a non-empty values array");
                return new In(FieldName(body), vs.Select(Scalar).ToList());
            case "present": return new Present(FieldName(body));
            case "absent": return new Absent(FieldName(body));
            case "all": return new All(List(body));
            case "any": return new Any(List(body));
            case "not": return new Not(Parse(body));
            default: throw new ValidonceFormatException($"unknown condition '{op}'");
        }
    }

    private static IReadOnlyList<Condition> List(JsonNode? n)
    {
        if (n is not JsonArray a || a.Count == 0)
            throw new ValidonceFormatException("'all'/'any' need a non-empty array");
        return a.Select(Parse).ToList();
    }

    internal static JsonNode Req(JsonNode? o, string name) =>
        o is JsonObject obj && obj[name] is { } v ? v : throw new ValidonceFormatException($"missing '{name}'");

    internal static string FieldName(JsonNode? o) =>
        Req(o, "field") is JsonValue v && v.GetValueKind() == JsonValueKind.String && v.GetValue<string>().Length > 0
            ? v.GetValue<string>()
            : throw new ValidonceFormatException("'field' must be a non-empty string");

    private static JsonNode Scalar(JsonNode? n)
    {
        var k = n?.GetValueKind();
        if (n is JsonValue && k is JsonValueKind.String or JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False)
            return n.DeepClone();
        throw new ValidonceFormatException("condition value must be a string, number or boolean");
    }

    public sealed record Eq(string Field, JsonNode Value) : Condition
    {
        public override bool Evaluate(JsonObject data) => Values.StrictEquals(Values.Get(data, Field), Value);
    }

    public sealed record Ne(string Field, JsonNode Value) : Condition
    {
        public override bool Evaluate(JsonObject data) => !Values.StrictEquals(Values.Get(data, Field), Value);
    }

    public sealed record In(string Field, IReadOnlyList<JsonNode> ValueList) : Condition
    {
        public override bool Evaluate(JsonObject data)
        {
            var v = Values.Get(data, Field);
            return ValueList.Any(x => Values.StrictEquals(v, x));
        }
    }

    public sealed record Present(string Field) : Condition
    {
        public override bool Evaluate(JsonObject data) => !Values.IsBlank(Values.Get(data, Field));
    }

    public sealed record Absent(string Field) : Condition
    {
        public override bool Evaluate(JsonObject data) => Values.IsBlank(Values.Get(data, Field));
    }

    public sealed record All(IReadOnlyList<Condition> Items) : Condition
    {
        public override bool Evaluate(JsonObject data) => Items.All(c => c.Evaluate(data));
    }

    public sealed record Any(IReadOnlyList<Condition> Items) : Condition
    {
        public override bool Evaluate(JsonObject data) => Items.Any(c => c.Evaluate(data));
    }

    public sealed record Not(Condition Inner) : Condition
    {
        public override bool Evaluate(JsonObject data) => !Inner.Evaluate(data);
    }
}
