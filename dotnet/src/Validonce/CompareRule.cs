// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json;
using System.Text.Json.Nodes;

namespace Validonce;

/// <summary>The operator of a compare rule.</summary>
public enum CompareOp
{
    /// <summary>Less than.</summary>
    Lt,
    /// <summary>Less than or equal.</summary>
    Le,
    /// <summary>Greater than.</summary>
    Gt,
    /// <summary>Greater than or equal.</summary>
    Ge,
    /// <summary>Equal.</summary>
    Eq,
    /// <summary>Not equal.</summary>
    Ne,
}

/// <summary>How the two sides of a compare rule are read and ordered.</summary>
public enum CompareType
{
    /// <summary>JSON numbers.</summary>
    Number,
    /// <summary>Strings, ordered by code point.</summary>
    String,
    /// <summary>Calendar dates (<c>yyyy-MM-dd</c>).</summary>
    Date,
    /// <summary>Instants with a UTC offset (RFC 3339).</summary>
    DateTime,
}

/// <summary>Compares one field with another field or with a constant.</summary>
/// <param name="Id">The rule id.</param>
/// <param name="Path">The path to report on, or null for the left field.</param>
/// <param name="Message">The message key and params.</param>
/// <param name="ServerOnly">True when clients skip this rule.</param>
/// <param name="LeftField">The field on the left of the operator.</param>
/// <param name="Op">The operator.</param>
/// <param name="RightField">The field on the right, or null when a constant is used.</param>
/// <param name="RightValue">The constant on the right, or null when a field is used.</param>
/// <param name="Type">How the values are read and ordered.</param>
public sealed record CompareRule(
    string Id, string? Path, RuleMessage Message, bool ServerOnly,
    string LeftField, CompareOp Op, string? RightField, JsonNode? RightValue, CompareType Type)
    : Rule(Id, "compare", Path, Message, ServerOnly)
{
    /// <inheritdoc />
    public override string EffectivePath => Path ?? LeftField;

    internal static CompareRule FromJson(string id, string? path, RuleMessage message, bool serverOnly, JsonObject o)
    {
        var left = Condition.FieldName(o["left"]);
        var op = Str(o, "op") switch
        {
            "lt" => CompareOp.Lt, "le" => CompareOp.Le, "gt" => CompareOp.Gt,
            "ge" => CompareOp.Ge, "eq" => CompareOp.Eq, "ne" => CompareOp.Ne,
            var x => throw new ValidonceFormatException($"unknown op '{x}'"),
        };
        var type = Str(o, "type") switch
        {
            "number" => CompareType.Number, "string" => CompareType.String,
            "date" => CompareType.Date, "datetime" => CompareType.DateTime,
            var x => throw new ValidonceFormatException($"unknown type '{x}'"),
        };
        if (o["right"] is not JsonObject r) throw new ValidonceFormatException("'right' must be an object");
        string? rf = null; JsonNode? rv = null;
        if (r["field"] is not null) rf = Condition.FieldName(r);
        else
        {
            var v = r["value"];
            var k = v?.GetValueKind();
            if (v is JsonValue && k is JsonValueKind.String or JsonValueKind.Number) rv = v.DeepClone();
            else throw new ValidonceFormatException("'right' needs a field or a string/number value");
        }
        return new CompareRule(id, path, message, serverOnly, left, op, rf, rv, type);
    }

    /// <inheritdoc />
    public override bool Fails(JsonObject data)
    {
        var l = Values.Get(data, LeftField);
        var r = RightField is not null ? Values.Get(data, RightField) : RightValue;
        if (Values.IsBlank(l) || Values.IsBlank(r)) return false;
        if (!TryOrder(l!, r!, out var cmp)) return false;
        var holds = Op switch
        {
            CompareOp.Lt => cmp < 0, CompareOp.Le => cmp <= 0, CompareOp.Gt => cmp > 0,
            CompareOp.Ge => cmp >= 0, CompareOp.Eq => cmp == 0, _ => cmp != 0,
        };
        return !holds;
    }

    private bool TryOrder(JsonNode l, JsonNode r, out int cmp)
    {
        cmp = 0;
        switch (Type)
        {
            case CompareType.Number:
                if (!Values.IsNumber(l) || !Values.IsNumber(r)) return false;
                var a = Values.Num(l); var b = Values.Num(r);
                cmp = a < b ? -1 : a > b ? 1 : 0;
                return true;
            case CompareType.String:
                if (!Values.IsString(l) || !Values.IsString(r)) return false;
                cmp = Values.CompareCodePoints(l.GetValue<string>(), r.GetValue<string>());
                return true;
            case CompareType.Date:
            case CompareType.DateTime:
                if (!Values.IsString(l) || !Values.IsString(r)) return false;
                long? x, y;
                if (Type == CompareType.Date) { x = Values.ParseDate(l.GetValue<string>()); y = Values.ParseDate(r.GetValue<string>()); }
                else { x = Values.ParseDateTime(l.GetValue<string>()); y = Values.ParseDateTime(r.GetValue<string>()); }
                if (x is null || y is null) return false;
                cmp = x.Value.CompareTo(y.Value);
                return true;
        }
        return false;
    }
}
