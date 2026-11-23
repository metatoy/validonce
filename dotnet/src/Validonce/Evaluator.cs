// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;

namespace Validonce;

public enum EvaluationSide { Server, Client }

public static class Evaluator
{
    public static IReadOnlyList<Issue> Evaluate(
        IReadOnlyList<Rule> rules, JsonObject data, EvaluationSide side = EvaluationSide.Server)
    {
        var issues = new List<Issue>();
        foreach (var rule in rules)
        {
            if (side == EvaluationSide.Client && rule.ServerOnly) continue;
            if (!rule.Fails(data)) continue;
            issues.Add(new Issue(new[] { rule.EffectivePath }, rule.Id, rule.Message.Key,
                new Dictionary<string, JsonNode?>(rule.Message.Params)));
        }
        return issues;
    }
}
