// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json;
using System.Text.Json.Nodes;

namespace Validonce;

/// <summary>A cross-field rule. The concrete kinds are <see cref="RequiredWhenRule"/>, <see cref="CompareRule"/> and <see cref="GroupRule"/>.</summary>
/// <param name="Id">The rule id, unique in its rule set.</param>
/// <param name="Kind">The rule kind as written in the rule format.</param>
/// <param name="Path">The path to report on, or null for the kind's default.</param>
/// <param name="Message">The message key and params.</param>
/// <param name="ServerOnly">True when clients skip this rule.</param>
public abstract record Rule(string Id, string Kind, string? Path, RuleMessage Message, bool ServerOnly)
{
    /// <summary>The path the issue is reported on (explicit path or the kind's default).</summary>
    public abstract string EffectivePath { get; }

    /// <summary>True when the rule FAILS for this data (i.e. an issue is produced).</summary>
    public abstract bool Fails(JsonObject data);

    internal static Rule Parse(JsonNode? node)
    {
        if (node is not JsonObject o) throw new ValidonceFormatException("a rule must be an object");
        var id = Str(o, "id");
        var kind = Str(o, "kind");
        var path = o["path"] is null ? null : Str(o, "path");
        var message = ParseMessage(o["message"]);
        var serverOnly = o["server_only"] is { } so && so.GetValueKind() == JsonValueKind.True;
        switch (kind)
        {
            case "required_when":
                return new RequiredWhenRule(id, path, message, serverOnly, Condition.FieldName(o), Condition.Parse(o["when"]));
            case "compare":
                return CompareRule.FromJson(id, path, message, serverOnly, o);
            case "at_least_one_of":
            case "exactly_one_of":
            case "all_or_none":
                if (o["fields"] is not JsonArray fa || fa.Count < 2)
                    throw new ValidonceFormatException("'fields' needs 2 or more names");
                var fields = fa.Select(f => f is JsonValue v && v.GetValueKind() == JsonValueKind.String
                    ? v.GetValue<string>() : throw new ValidonceFormatException("field names must be strings")).ToList();
                return new GroupRule(id, kind, path, message, serverOnly, fields);
            default:
                throw new ValidonceFormatException($"unknown rule kind '{kind}'");
        }
    }

    internal static string Str(JsonObject o, string name) =>
        o[name] is JsonValue v && v.GetValueKind() == JsonValueKind.String && v.GetValue<string>().Length > 0
            ? v.GetValue<string>()
            : throw new ValidonceFormatException($"'{name}' must be a non-empty string");

    private static RuleMessage ParseMessage(JsonNode? n)
    {
        if (n is not JsonObject m) throw new ValidonceFormatException("'message' must be an object");
        var key = Str(m, "key");
        var prms = new Dictionary<string, JsonNode?>();
        if (m["params"] is { } p)
        {
            if (p is not JsonObject po) throw new ValidonceFormatException("'params' must be an object");
            foreach (var kv in po) prms[kv.Key] = kv.Value?.DeepClone();
        }
        return new RuleMessage(key, prms);
    }
}

/// <summary>The field must not be blank whenever the condition holds.</summary>
/// <param name="Id">The rule id.</param>
/// <param name="Path">The path to report on, or null for the field.</param>
/// <param name="Message">The message key and params.</param>
/// <param name="ServerOnly">True when clients skip this rule.</param>
/// <param name="Field">The required field.</param>
/// <param name="When">The condition that makes the field required.</param>
public sealed record RequiredWhenRule(string Id, string? Path, RuleMessage Message, bool ServerOnly, string Field, Condition When)
    : Rule(Id, "required_when", Path, Message, ServerOnly)
{
    /// <inheritdoc />
    public override string EffectivePath => Path ?? Field;

    /// <inheritdoc />
    public override bool Fails(JsonObject data) =>
        When.Evaluate(data) && Values.IsBlank(Values.Get(data, Field));
}

/// <summary>at_least_one_of, exactly_one_of or all_or_none over a list of fields.</summary>
/// <param name="Id">The rule id.</param>
/// <param name="Kind">The group kind: <c>at_least_one_of</c>, <c>exactly_one_of</c> or <c>all_or_none</c>.</param>
/// <param name="Path">The path to report on, or null for the first field.</param>
/// <param name="Message">The message key and params.</param>
/// <param name="ServerOnly">True when clients skip this rule.</param>
/// <param name="Fields">The fields in the group.</param>
public sealed record GroupRule(string Id, string Kind, string? Path, RuleMessage Message, bool ServerOnly, IReadOnlyList<string> Fields)
    : Rule(Id, Kind, Path, Message, ServerOnly)
{
    /// <inheritdoc />
    public override string EffectivePath => Path ?? Fields[0];

    /// <inheritdoc />
    public override bool Fails(JsonObject data)
    {
        var filled = Fields.Count(f => !Values.IsBlank(Values.Get(data, f)));
        return Kind switch
        {
            "at_least_one_of" => filled == 0,
            "exactly_one_of" => filled != 1,
            "all_or_none" => filled != 0 && filled != Fields.Count,
            _ => throw new NotSupportedException($"unknown group kind '{Kind}'"),
        };
    }
}
