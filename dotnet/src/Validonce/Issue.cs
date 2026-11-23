// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;

namespace Validonce;

public sealed record Issue(
    IReadOnlyList<string> Path,
    string RuleId,
    string Key,
    IReadOnlyDictionary<string, JsonNode?> Params)
{
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
