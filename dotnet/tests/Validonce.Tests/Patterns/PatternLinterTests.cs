// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json;
using Validonce.Patterns;
using Xunit;

namespace Validonce.Tests.Patterns;

public class PatternLinterTests
{
    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "conformance", "regex"))) return dir.FullName;
            dir = dir.Parent;
        }
        throw new InvalidOperationException("repo root with conformance/regex not found");
    }

    private static readonly Lazy<Dictionary<string, (string Finding, string Pattern, bool Control)>> Cases = new(() =>
    {
        var map = new Dictionary<string, (string, string, bool)>();
        foreach (var f in Directory.GetFiles(Path.Combine(RepoRoot(), "conformance", "regex"), "*.json"))
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(f));
            foreach (var c in doc.RootElement.GetProperty("cases").EnumerateArray())
                {
                    // A portable control: every input gets the same result from all five engines.
                    bool control = c.GetProperty("inputs").EnumerateArray().All(inp =>
                        inp.GetProperty("expect").EnumerateObject().Select(e => e.Value.GetString()).Distinct().Count() == 1);
                    map[c.GetProperty("id").GetString()!] = (c.GetProperty("finding").GetString()!, c.GetProperty("pattern").GetString()!, control);
                }
        }
        return map;
    });

    public static IEnumerable<object[]> CaseIds() => Cases.Value.Keys.OrderBy(k => k, StringComparer.Ordinal).Select(k => new object[] { k });

    [Theory]
    [MemberData(nameof(CaseIds))]
    public void Oracle_case_is_detected(string id)
    {
        var (finding, pattern, control) = Cases.Value[id];
        var found = PatternLinter.Lint(pattern);
        if (control) Assert.DoesNotContain(found, f => f.Id == finding);
        else Assert.Contains(found, f => f.Id == finding);
    }

    [Fact]
    public void Only_rx038_is_a_portable_control()
    {
        Assert.Equal(new[] { "rx-038" }, Cases.Value.Where(kv => kv.Value.Control).Select(kv => kv.Key).OrderBy(k => k).ToArray());
    }

    [Fact]
    public void Fixtures_hold_42_cases_and_all_finding_ids_exist_in_table()
    {
        Assert.Equal(42, Cases.Value.Count);
        var ids = PatternLinter.Findings.Select(f => f.Id).ToHashSet();
        foreach (var (_, (finding, _, _)) in Cases.Value) Assert.Contains(finding, ids);
    }

    [Fact]
    public void Table_loads_25_findings_with_all_engines()
    {
        Assert.Equal(25, PatternLinter.Findings.Count);
        Assert.All(PatternLinter.Findings, f => Assert.Equal(5, f.Engines.Count));
        Assert.All(PatternLinter.SafeRewriteIds, id => Assert.Contains(PatternLinter.Findings, f => f.Id == id));
    }

    [Theory]
    [InlineData("^[A-Za-z0-9_]+")]
    [InlineData("^[0-9]{3}-[0-9]{4}")]
    [InlineData("^[a-z]+(?:-[a-z]+)*")]
    [InlineData("^[^@ ]+@[^@ ]+")]
    [InlineData("^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}")]
    [InlineData("abc")]
    [InlineData("^")]
    [InlineData("[A-F0-9]{8}")]
    [InlineData("a|b")]
    [InlineData("(?:ab)+c?")]
    [InlineData("^[a-z]{2,5}")]
    [InlineData("x*y+z?")]
    [InlineData("[^\\n\\r]+")]
    [InlineData("\\t\\n\\r")]
    [InlineData("^(?:abc|def)")]
    [InlineData("[a-z0-9-]+")]
    [InlineData("a{2}")]
    [InlineData("(ab)(cd)")]
    [InlineData("\\/\\*")]
    [InlineData("a{2,}?")]
    [InlineData("")]
    public void Portable_patterns_have_no_findings(string pattern)
    {
        Assert.Empty(PatternLinter.Lint(pattern));
    }

    [Fact]
    public void Span_and_rewrite_for_word_shorthand()
    {
        var f = Assert.Single(PatternLinter.Lint("^a\\wb"), x => x.Id == "VR001");
        Assert.Equal(2, f.Start);
        Assert.Equal(2, f.Length);
        Assert.Equal("^a[A-Za-z0-9_]b", "^a\\wb".Remove(f.Start, f.Length).Insert(f.Start, f.Rewrite!));
        Assert.Equal(Severity.Error, f.Severity);
    }

    [Fact]
    public void Shorthand_inside_class_uses_bare_range_rewrite()
    {
        var f = Assert.Single(PatternLinter.Lint("[\\w.]"), x => x.Id == "VR001");
        Assert.Equal("A-Za-z0-9_", f.Rewrite);
        Assert.Equal("[0-9]", PatternLinter.Lint("\\d").Single(x => x.Id == "VR002").Rewrite);
    }

    [Fact]
    public void Engines_filter_drops_findings_that_only_concern_excluded_engines()
    {
        const string p = "^(?!admin)[a-z]+";
        Assert.Contains(PatternLinter.Lint(p), f => f.Id == "VR009");
        var filtered = PatternLinter.Lint(p, new LintOptions(new HashSet<Engine> { Engine.Js, Engine.DotNet }));
        Assert.DoesNotContain(filtered, f => f.Id == "VR009");
        var only = PatternLinter.Lint(p, new LintOptions(new HashSet<Engine> { Engine.RustRegex }));
        Assert.Equal(new[] { Engine.RustRegex }, Assert.Single(only, f => f.Id == "VR009").Engines);
    }

    [Fact]
    public void Unterminated_class_is_VR000_and_does_not_throw()
    {
        var found = PatternLinter.Lint("[abc");
        var f = Assert.Single(found);
        Assert.Equal("VR000", f.Id);
        Assert.Equal(Severity.Error, f.Severity);
        Assert.Equal(0, f.Start);
        Assert.Equal(4, f.Length);
        Assert.Equal("Pattern could not be parsed", f.Title);
        Assert.Contains(PatternLinter.Lint("a)"), x => x.Id == "VR000");
        Assert.Contains(PatternLinter.Lint("(a"), x => x.Id == "VR000");
        Assert.Contains(PatternLinter.Lint("*a"), x => x.Id == "VR000");
        Assert.Contains(PatternLinter.Lint("a\\"), x => x.Id == "VR000");
    }

    [Fact]
    public void Findings_are_sorted_and_unique_per_id_and_start()
    {
        var found = PatternLinter.Lint("^.\\w\\d$|.");
        Assert.Equal(found.OrderBy(f => f.Start).ThenBy(f => f.Id, StringComparer.Ordinal).ToList(), found.ToList());
        Assert.Equal(found.Count, found.Select(f => (f.Id, f.Start)).Distinct().Count());
        Assert.All(found, f => Assert.True(f.Length >= 1));
    }

    [Fact]
    public void Safe_rewrites_only_on_listed_ids()
    {
        var found = PatternLinter.Lint("^\\w\\s.{,3}\\A(?>a)\\k<x>(?<x>a)\\x{263A}\\@[[:alpha:]]a++a{2]");
        foreach (var f in found.Where(f => f.Rewrite is not null))
            Assert.Contains(f.Id, PatternLinter.SafeRewriteIds);
    }

    [Fact]
    public void Fuzz_never_throws()
    {
        const string alphabet = "\\[]()(){}?*+^$.|-&:<>=!P#'ibwdsxuUpk0189,a";
        var rng = new Random(20261122);
        for (int i = 0; i < 2000; i++)
        {
            var len = rng.Next(0, 14);
            var chars = new char[len];
            for (int k = 0; k < len; k++) chars[k] = alphabet[rng.Next(alphabet.Length)];
            var s = new string(chars);
            var found = PatternLinter.Lint(s);
            foreach (var f in found)
            {
                Assert.True(f.Start >= 0 && f.Length >= 1 && f.Start + f.Length <= Math.Max(s.Length, 1), $"bad span for '{s}'");
            }
        }
    }
}
