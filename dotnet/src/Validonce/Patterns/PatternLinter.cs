// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

namespace Validonce.Patterns;

/// <summary>
/// Finds regex constructs whose meaning differs between JavaScript, Python re, Rust regex and .NET.
/// The ids, titles, severities, summaries and rewrites come from spec/regex-findings.json.
/// </summary>
public static class PatternLinter
{
    /// <summary>Id used when the pattern cannot be tokenized. Not part of the table.</summary>
    public const string ParseErrorId = "VR000";

    /// <summary>The whole findings table.</summary>
    public static IReadOnlyList<FindingInfo> Findings { get; } = FindingTable.All;

    /// <summary>Finding ids that can carry a drop-in <see cref="PatternFinding.Rewrite"/>.</summary>
    public static IReadOnlyList<string> SafeRewriteIds { get; } = new[]
    {
        "VR001", "VR002", "VR003", "VR006", "VR007", "VR011", "VR012",
        "VR016", "VR018", "VR019", "VR023", "VR025", "VR026",
    };

    private static readonly Engine[] AllEngines = { Engine.Js, Engine.JsU, Engine.PythonRe, Engine.RustRegex, Engine.DotNet };

    // Engines that behave differently from the others, or reject the construct.
    private static readonly Dictionary<string, Engine[]> Affected = new(StringComparer.Ordinal)
    {
        ["VR007"] = new[] { Engine.Js, Engine.JsU },
        ["VR008"] = new[] { Engine.PythonRe, Engine.RustRegex },
        ["VR009"] = new[] { Engine.RustRegex },
        ["VR010"] = new[] { Engine.RustRegex },
        ["VR013"] = new[] { Engine.Js, Engine.JsU, Engine.PythonRe },
        ["VR016"] = new[] { Engine.PythonRe, Engine.RustRegex, Engine.DotNet },
        ["VR017"] = new[] { Engine.Js, Engine.PythonRe },
        ["VR022"] = new[] { Engine.JsU, Engine.PythonRe, Engine.RustRegex },
        ["VR025"] = new[] { Engine.JsU, Engine.RustRegex },
        ["VR026"] = new[] { Engine.JsU, Engine.DotNet },
    };

    /// <summary>Lints one pattern. Never throws; an unparseable pattern yields a VR000 finding.</summary>
    public static IReadOnlyList<PatternFinding> Lint(string pattern, LintOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(pattern);
        var hits = PatternScanner.Scan(pattern, out var failAt);
        var wanted = options?.Engines;
        var result = new List<PatternFinding>();
        var seen = new HashSet<(string, int)>();

        foreach (var h in hits)
        {
            if (!seen.Add((h.Id, h.Start))) continue;
            var info = FindingTable.ById[h.Id];
            var engines = Affected.GetValueOrDefault(h.Id, AllEngines);
            if (wanted is not null)
            {
                engines = engines.Where(wanted.Contains).ToArray();
                if (engines.Length == 0) continue;
            }
            var text = pattern.Substring(h.Start, h.Length);
            var message = $"{info.Summary} Found: {text}";
            result.Add(new PatternFinding(h.Id, info.Severity, h.Start, h.Length,
                info.Title, message, h.Rewrite, engines));
        }

        if (failAt is int at && seen.Add((ParseErrorId, at)))
        {
            var start = Math.Min(at, Math.Max(0, pattern.Length - 1));
            result.Add(new PatternFinding(ParseErrorId, Severity.Error, start, Math.Max(1, pattern.Length - start),
                "Pattern could not be parsed",
                $"The pattern could not be parsed from index {start}; engines may reject it or read it differently.",
                null, wanted is null ? AllEngines : AllEngines.Where(wanted.Contains).ToArray()));
        }

        result.Sort((a, b) => a.Start != b.Start ? a.Start.CompareTo(b.Start) : string.CompareOrdinal(a.Id, b.Id));
        return result;
    }
}
