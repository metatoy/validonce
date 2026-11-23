// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json;
using System.Text.Json.Nodes;

namespace Validonce;

public sealed record RuleSet(int Version, IReadOnlyList<Rule> Rules)
{
    /// <summary>The rule-format JSON object (the value of <c>x-validonce</c>).</summary>
    public JsonObject ToJson() => RuleJson.Write(this);

    public static RuleSet Parse(string json)
    {
        JsonNode? node;
        try { node = JsonNode.Parse(json); }
        catch (JsonException e) { throw new ValidonceFormatException("invalid JSON: " + e.Message); }
        return Parse(node);
    }

    /// <summary>Parses the x-validonce object.</summary>
    public static RuleSet Parse(JsonNode? xValidonce)
    {
        if (xValidonce is not JsonObject o) throw new ValidonceFormatException("x-validonce must be an object");
        if (o["version"] is not JsonValue v || v.GetValueKind() != JsonValueKind.Number || Values.Num(v) != 1)
            throw new ValidonceFormatException("unsupported version: only version 1 is supported");
        if (o["rules"] is not JsonArray arr) throw new ValidonceFormatException("'rules' must be an array");
        return new RuleSet(1, arr.Select(Rule.Parse).ToList());
    }
}
