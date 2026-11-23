// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;
using Validonce;
using Xunit;

namespace Validonce.Tests;

public class ConformanceTests
{
    private sealed record Case(string File, string Id, JsonObject Node);

    private static readonly Lazy<IReadOnlyList<Case>> All = new(Load);

    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "conformance", "rules"))) return dir.FullName;
            dir = dir.Parent;
        }
        throw new InvalidOperationException("repo root with conformance/rules not found");
    }

    private static IReadOnlyList<Case> Load()
    {
        var cases = new List<Case>();
        var files = Directory.GetFiles(Path.Combine(RepoRoot(), "conformance", "rules"), "*.json")
            .OrderBy(f => f, StringComparer.Ordinal);
        foreach (var f in files)
        {
            var doc = JsonNode.Parse(File.ReadAllText(f))!.AsObject();
            foreach (var c in doc["cases"]!.AsArray())
                cases.Add(new Case(Path.GetFileName(f), c!["id"]!.GetValue<string>(), c.AsObject()));
        }
        return cases;
    }

    public static IEnumerable<object[]> CaseSides() =>
        All.Value.SelectMany(c => new[]
        {
            new object[] { c.File, c.Id, "Server" },
            new object[] { c.File, c.Id, "Client" },
        });

    [Fact]
    public void LoadsExactly95Cases() => Assert.Equal(95, All.Value.Count);

    [Theory]
    [MemberData(nameof(CaseSides))]
    public void RunCase(string file, string id, string side)
    {
        var c = All.Value.Single(x => x.File == file && x.Id == id);
        var rules = c.Node["rules"]!.AsArray();
        var set = RuleSet.Parse(new JsonObject { ["version"] = 1, ["rules"] = rules.DeepClone() });
        var data = c.Node["data"]!.AsObject();
        var expect = c.Node["expect"]!.AsArray();

        var client = side == "Client";
        var serverOnly = rules.Where(r => r!["server_only"]?.GetValue<bool>() == true)
            .Select(r => r!["id"]!.GetValue<string>()).ToHashSet();
        var wanted = new JsonArray(expect
            .Where(e => !client || !serverOnly.Contains(e!["ruleId"]!.GetValue<string>()))
            .Select(e => e!.DeepClone()).ToArray());

        var actual = new JsonArray(Evaluator.Evaluate(set.Rules, data,
            client ? EvaluationSide.Client : EvaluationSide.Server)
            .Select(i => (JsonNode?)i.ToJson()).ToArray());

        Assert.True(JsonNode.DeepEquals(wanted, actual),
            $"{id} {side}: expected {wanted.ToJsonString()} but got {actual.ToJsonString()}");
    }
}
