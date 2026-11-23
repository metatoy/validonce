// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json;

namespace Validonce.Patterns;

/// <summary>How serious a portability finding is.</summary>
public enum Severity { Info, Warning, Error }

/// <summary>The regex engines the linter reasons about (fixture names: js, js-u, python-re, rust-regex, dotnet).</summary>
public enum Engine { Js, JsU, PythonRe, RustRegex, DotNet }

/// <summary>One portability problem found in a pattern.</summary>
public sealed record PatternFinding(
    string Id,
    Severity Severity,
    int Start,
    int Length,
    string Title,
    string Message,
    string? Rewrite,
    IReadOnlyList<Engine> Engines);

/// <summary>Options for <see cref="PatternLinter.Lint"/>.</summary>
public sealed record LintOptions(IReadOnlySet<Engine>? Engines = null);

/// <summary>One row of the findings table (spec/regex-findings.json).</summary>
public sealed record FindingInfo(
    string Id,
    string Title,
    string Summary,
    Severity Severity,
    IReadOnlyDictionary<Engine, string> Engines,
    string? Rewrite);

internal static class FindingTable
{
    internal static readonly IReadOnlyList<FindingInfo> All = Load();
    internal static readonly IReadOnlyDictionary<string, FindingInfo> ById = All.ToDictionary(f => f.Id, StringComparer.Ordinal);

    private static Engine? EngineFromName(string name) => name switch
    {
        "js" => Engine.Js,
        "js-u" => Engine.JsU,
        "python-re" => Engine.PythonRe,
        "rust-regex" => Engine.RustRegex,
        "dotnet" => Engine.DotNet,
        _ => null,
    };

    private static IReadOnlyList<FindingInfo> Load()
    {
        var asm = typeof(FindingTable).Assembly;
        using var stream = asm.GetManifestResourceStream("Validonce.regex-findings.json")
            ?? throw new InvalidOperationException("embedded resource Validonce.regex-findings.json missing");
        using var doc = JsonDocument.Parse(stream);
        var list = new List<FindingInfo>();
        foreach (var f in doc.RootElement.GetProperty("findings").EnumerateArray())
        {
            var engines = new Dictionary<Engine, string>();
            foreach (var e in f.GetProperty("engines").EnumerateObject())
            {
                var eng = EngineFromName(e.Name);
                if (eng is not null) engines[eng.Value] = e.Value.GetString() ?? "";
            }
            var sev = f.GetProperty("severity").GetString() switch
            {
                "error" => Severity.Error,
                "warning" => Severity.Warning,
                _ => Severity.Info,
            };
            var rw = f.TryGetProperty("rewrite", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null;
            list.Add(new FindingInfo(
                f.GetProperty("id").GetString()!,
                f.GetProperty("title").GetString()!,
                f.GetProperty("summary").GetString()!,
                sev, engines, rw));
        }
        return list;
    }
}
