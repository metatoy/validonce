// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;

namespace Validonce;

/// <summary>Writes the rule model back to rule-format JSON.</summary>
internal static class RuleJson
{
    public static JsonObject Write(RuleSet set)
    {
        var rules = new JsonArray();
        foreach (var r in set.Rules) rules.Add(WriteRule(r));
        return new JsonObject { ["version"] = set.Version, ["rules"] = rules };
    }

    private static JsonObject WriteRule(Rule rule)
    {
        var o = new JsonObject { ["id"] = rule.Id, ["kind"] = rule.Kind };
        if (rule.Path is not null) o["path"] = rule.Path;
        switch (rule)
        {
            case RequiredWhenRule rw:
                o["field"] = rw.Field;
                o["when"] = WriteCondition(rw.When);
                break;
            case CompareRule c:
                o["left"] = new JsonObject { ["field"] = c.LeftField };
                o["op"] = c.Op.ToString().ToLowerInvariant();
                o["right"] = c.RightField is not null
                    ? new JsonObject { ["field"] = c.RightField }
                    : new JsonObject { ["value"] = c.RightValue?.DeepClone() };
                o["type"] = c.Type.ToString().ToLowerInvariant();
                break;
            case GroupRule g:
                o["fields"] = new JsonArray(g.Fields.Select(f => (JsonNode)JsonValue.Create(f)!).ToArray());
                break;
            default:
                throw new NotSupportedException($"writing '{rule.Kind}' rules is not implemented yet");
        }
        var message = new JsonObject { ["key"] = rule.Message.Key };
        if (rule.Message.Params.Count > 0)
        {
            var p = new JsonObject();
            foreach (var kv in rule.Message.Params) p[kv.Key] = kv.Value?.DeepClone();
            message["params"] = p;
        }
        o["message"] = message;
        if (rule.ServerOnly) o["server_only"] = true;
        return o;
    }

    private static JsonNode WriteCondition(Condition c) => c switch
    {
        Condition.Eq e => new JsonObject { ["eq"] = Fv(e.Field, e.Value) },
        Condition.Ne e => new JsonObject { ["ne"] = Fv(e.Field, e.Value) },
        Condition.In i => new JsonObject
        {
            ["in"] = new JsonObject
            {
                ["field"] = i.Field,
                ["values"] = new JsonArray(i.ValueList.Select(v => v.DeepClone()).ToArray()),
            },
        },
        Condition.Present p => new JsonObject { ["present"] = new JsonObject { ["field"] = p.Field } },
        Condition.Absent a => new JsonObject { ["absent"] = new JsonObject { ["field"] = a.Field } },
        Condition.All a => new JsonObject { ["all"] = new JsonArray(a.Items.Select(WriteCondition).ToArray()) },
        Condition.Any a => new JsonObject { ["any"] = new JsonArray(a.Items.Select(WriteCondition).ToArray()) },
        Condition.Not n => new JsonObject { ["not"] = WriteCondition(n.Inner) },
        _ => throw new NotSupportedException("unknown condition"),
    };

    private static JsonObject Fv(string field, JsonNode value) =>
        new() { ["field"] = field, ["value"] = value.DeepClone() };
}
