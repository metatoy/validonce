// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;

namespace Validonce;

/// <summary>Which side is evaluating the rules.</summary>
public enum EvaluationSide
{
    /// <summary>The server runs every rule.</summary>
    Server,
    /// <summary>A client skips rules marked server-only.</summary>
    Client,
}

/// <summary>Runs rules against JSON data and returns the issues.</summary>
public static class Evaluator
{
    /// <summary>Returns one issue for each rule that fails, in rule order.</summary>
    /// <param name="rules">The rules to run.</param>
    /// <param name="data">The data to check.</param>
    /// <param name="side">Client skips server-only rules.</param>
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
