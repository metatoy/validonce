// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;

namespace Validonce.FluentValidation;

/// <summary>Options for one cross-field rule. Returned by <c>RequiredWhen</c> / <c>Compare</c>.</summary>
public sealed class ValidonceRuleBuilder
{
    internal ValidonceRuleBuilder(string kind, string field, Func<string, RuleMessage, bool, Rule> build)
    {
        Kind = kind; Field = field; Build = build;
    }

    internal string Kind { get; }
    internal string Field { get; }
    internal Func<string, RuleMessage, bool, Rule> Build { get; }
    internal string? RuleId { get; private set; }
    internal string? MessageKey { get; private set; }
    internal IReadOnlyDictionary<string, JsonNode?> Params { get; private set; } = new Dictionary<string, JsonNode?>();
    internal bool IsServerOnly { get; private set; }
    internal string? ErrorMessage { get; private set; }

    /// <summary>The message key clients translate. Params values are strings, numbers, booleans or null.</summary>
    public ValidonceRuleBuilder WithMessageKey(string key, IReadOnlyDictionary<string, object?>? parameters = null)
    {
        if (string.IsNullOrEmpty(key)) throw new ArgumentException("message key must not be empty", nameof(key));
        MessageKey = key;
        var p = new Dictionary<string, JsonNode?>();
        foreach (var kv in parameters ?? new Dictionary<string, object?>())
        {
            var n = kv.Value is null ? null : System.Text.Json.JsonSerializer.SerializeToNode(kv.Value, kv.Value.GetType());
            if (n is JsonObject or JsonArray)
                throw new ArgumentException($"param '{kv.Key}' must be a string, number, boolean or null");
            p[kv.Key] = n;
        }
        Params = p;
        return this;
    }

    /// <summary>Overrides the default id <c>TypeName.kind.wireField</c>.</summary>
    public ValidonceRuleBuilder WithRuleId(string id)
    {
        if (string.IsNullOrEmpty(id)) throw new ArgumentException("rule id must not be empty", nameof(id));
        RuleId = id;
        return this;
    }

    /// <summary>Clients skip this rule; the server always evaluates it.</summary>
    public ValidonceRuleBuilder ServerOnly()
    {
        IsServerOnly = true;
        return this;
    }

    /// <summary>Human-readable text for the FluentValidation failure (default: the message key).</summary>
    public ValidonceRuleBuilder WithMessage(string message)
    {
        ErrorMessage = message;
        return this;
    }
}
