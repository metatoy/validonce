// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;

namespace Validonce;

/// <summary>One failed rule: where it failed, which rule, and the message key to show.</summary>
/// <param name="Path">The path of the field the issue is reported on.</param>
/// <param name="RuleId">The id of the rule that failed.</param>
/// <param name="Key">The message key clients translate.</param>
/// <param name="Params">Values for the message.</param>
public sealed record Issue(
    IReadOnlyList<string> Path,
    string RuleId,
    string Key,
    IReadOnlyDictionary<string, JsonNode?> Params)
{
    /// <summary>The issue as rule-format JSON (<c>path</c>, <c>ruleId</c>, <c>key</c>, <c>params</c>).</summary>
    public JsonObject ToJson()
    {
        var path = new JsonArray();
        foreach (var p in Path) path.Add(JsonValue.Create(p));
        var prms = new JsonObject();
        foreach (var kv in Params) prms[kv.Key] = kv.Value?.DeepClone();
        return new JsonObject
        {
            ["path"] = path,
            ["ruleId"] = RuleId,
            ["key"] = Key,
            ["params"] = prms,
        };
    }
}
