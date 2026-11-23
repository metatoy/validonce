// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;
using Validonce;
using Xunit;

namespace Validonce.Tests;

public class UnitTests
{
    [Fact]
    public void Version2IsRejected() =>
        Assert.Throws<ValidonceFormatException>(() => RuleSet.Parse("""{"version":2,"rules":[]}"""));

    [Fact]
    public void GroupKindsEvaluate()
    {
        var set = RuleSet.Parse("""
            {"version":1,"rules":[{"id":"A.x","kind":"at_least_one_of","fields":["a","b"],"message":{"key":"k"}}]}
            """);
        Assert.Single(Evaluator.Evaluate(set.Rules, new JsonObject()));
        Assert.Empty(Evaluator.Evaluate(set.Rules, new JsonObject { ["b"] = "x" }));
    }
}
