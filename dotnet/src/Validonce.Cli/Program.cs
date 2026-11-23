// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Validonce.Patterns;

namespace Validonce.Cli;

/// <summary>The <c>validonce</c> command line tool.</summary>
public static class Program
{
    /// <summary>The tool entry point.</summary>
    /// <param name="args">The command line arguments.</param>
    /// <returns>The process exit code.</returns>
    public static int Main(string[] args) => Run(args, Console.Out, Console.Error, Console.In);

    internal static readonly (string Name, Engine Engine)[] EngineNames =
    {
        ("js", Engine.Js), ("js-u", Engine.JsU), ("python-re", Engine.PythonRe),
        ("rust-regex", Engine.RustRegex), ("dotnet", Engine.DotNet),
    };

    // Keywords whose subtrees hold data, not schemas.
    private static readonly HashSet<string> DataKeywords = new(StringComparer.Ordinal)
    {
        "example", "examples", "default", "enum", "const",
    };

    private const string Usage = """
        validonce - lint regular expressions for portability across regex engines

        Usage:
          validonce lint-regex <file.json | ->   lint every "pattern" in an OpenAPI / JSON Schema document
          validonce lint-regex --pattern <regex> lint one pattern
          validonce findings                      list the findings table
          validonce --version | --help

        Options for lint-regex:
          --engines <list>    comma-separated: js, js-u, python-re, rust-regex, dotnet (default: all)
          --fail-on <level>   error | warning | info | never (default: error)
          --ignore <ids>      comma-separated finding ids to drop, e.g. VR005,VR014
          --format <format>   text | json (default: text)

        Exit codes: 0 nothing at or above --fail-on (also --help, --version); 1 findings at or above it;
                    2 usage error, unreadable or invalid JSON (no arguments prints this usage and exits 2).
        """;

    /// <summary>Runs the CLI in-process. Returns the exit code.</summary>
    public static int Run(string[] args, TextWriter stdout, TextWriter stderr, TextReader? stdin = null)
    {
        if (args.Length == 0)
        {
            stdout.WriteLine(Usage);
            return 2;
        }

        switch (args[0])
        {
            case "--help" or "-h" or "help":
                stdout.WriteLine(Usage);
                return 0;
            case "--version" or "-v":
                stdout.WriteLine(InformationalVersion());
                return 0;
            case "findings":
                if (args.Length > 1) return UsageError(stderr, $"unexpected argument '{args[1]}'");
                return Findings(stdout);
            case "lint-regex":
                return LintRegex(args[1..], stdout, stderr, stdin ?? Console.In);
            default:
                return UsageError(stderr, $"unknown command '{args[0]}'");
        }
    }

    private static int UsageError(TextWriter stderr, string message)
    {
        stderr.WriteLine($"validonce: {message}");
        stderr.WriteLine("Run 'validonce --help' for usage.");
        return 2;
    }

    private static string InformationalVersion()
    {
        var v = typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? "0.0.0";
        var plus = v.IndexOf('+');
        return plus >= 0 ? v[..plus] : v;
    }

    private static string SevName(Severity s) => s.ToString().ToLowerInvariant();

    private static string EngineName(Engine e) => EngineNames.First(x => x.Engine == e).Name;

    private static int Findings(TextWriter stdout)
    {
        foreach (var f in PatternLinter.Findings)
            stdout.WriteLine($"{f.Id,-6} {SevName(f.Severity),-8} {f.Title}");
        return 0;
    }

    private sealed record Located(string Location, string Pattern, IReadOnlyList<PatternFinding> Findings);

    private static int LintRegex(string[] args, TextWriter stdout, TextWriter stderr, TextReader stdin)
    {
        string? input = null;
        string? single = null;
        var engines = new HashSet<Engine>();
        var failOn = "error";
        var ignore = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var format = "text";

        for (var i = 0; i < args.Length; i++)
        {
            var a = args[i];
            string? Value(string name)
            {
                if (a == name)
                {
                    if (i + 1 >= args.Length) return null;
                    return args[++i];
                }
                return a[(name.Length + 1)..];
            }
            bool Is(string name) => a == name || a.StartsWith(name + "=", StringComparison.Ordinal);

            if (Is("--pattern"))
            {
                single = Value("--pattern");
                if (single is null) return UsageError(stderr, "--pattern needs a value");
            }
            else if (Is("--engines"))
            {
                var v = Value("--engines");
                if (v is null) return UsageError(stderr, "--engines needs a value");
                foreach (var part in v.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    var match = EngineNames.Where(x => x.Name == part).ToArray();
                    if (match.Length == 0)
                        return UsageError(stderr, $"unknown engine '{part}' (expected js, js-u, python-re, rust-regex, dotnet)");
                    engines.Add(match[0].Engine);
                }
                if (engines.Count == 0) return UsageError(stderr, "--engines needs at least one engine");
            }
            else if (Is("--ignore"))
            {
                var v = Value("--ignore");
                if (v is null) return UsageError(stderr, "--ignore needs a value");
                foreach (var id in v.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    ignore.Add(id);
            }
            else if (Is("--fail-on"))
            {
                var v = Value("--fail-on");
                if (v is not ("error" or "warning" or "info" or "never"))
                    return UsageError(stderr, "--fail-on must be error, warning, info or never");
                failOn = v;
            }
            else if (Is("--format"))
            {
                var v = Value("--format");
                if (v is not ("text" or "json")) return UsageError(stderr, "--format must be text or json");
                format = v;
            }
            else if (a == "-" || !a.StartsWith('-'))
            {
                if (input is not null) return UsageError(stderr, "only one input file is allowed");
                input = a;
            }
            else
            {
                return UsageError(stderr, $"unknown option '{a}'");
            }
        }

        if (single is not null && input is not null)
            return UsageError(stderr, "give either a file or --pattern, not both");
        if (single is null && input is null)
            return UsageError(stderr, "lint-regex needs a file (or - for stdin) or --pattern <regex>");

        var options = engines.Count == 0 || engines.Count == EngineNames.Length ? null : new LintOptions(engines);
        var results = new List<Located>();

        if (single is not null)
        {
            results.Add(new Located("", single, PatternLinter.Lint(single, options)));
        }
        else
        {
            string text;
            try
            {
                text = input == "-" ? stdin.ReadToEnd() : File.ReadAllText(input!);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
            {
                stderr.WriteLine($"validonce: cannot read '{input}': {e.Message}");
                return 2;
            }

            JsonNode? root;
            try
            {
                root = JsonNode.Parse(text, null, new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip });
            }
            catch (JsonException e)
            {
                stderr.WriteLine($"validonce: invalid JSON in '{input}': {e.Message}");
                return 2;
            }

            Walk(root, "", options, results);
        }

        if (ignore.Count > 0)
            results = results.Select(r => r with { Findings = r.Findings.Where(f => !ignore.Contains(f.Id)).ToList() }).ToList();

        var findingCount = results.Sum(r => r.Findings.Count);
        var errors = results.Sum(r => r.Findings.Count(f => f.Severity == Severity.Error));
        var warnings = results.Sum(r => r.Findings.Count(f => f.Severity == Severity.Warning));
        var infos = findingCount - errors - warnings;
        var withFindings = results.Where(r => r.Findings.Count > 0).ToList();

        if (format == "json")
            WriteJson(stdout, results, results.Count, findingCount, errors, warnings, infos);
        else
            WriteText(stdout, withFindings, results.Count, findingCount, errors, warnings);

        var threshold = failOn switch
        {
            "error" => Severity.Error,
            "warning" => Severity.Warning,
            "info" => Severity.Info,
            _ => (Severity?)null,
        };
        var fail = threshold is { } t && results.Any(r => r.Findings.Any(f => f.Severity >= t));
        return fail ? 1 : 0;
    }

    private static string Escape(string segment) => segment.Replace("~", "~0").Replace("/", "~1");

    private static void Walk(JsonNode? node, string pointer, LintOptions? options, List<Located> results)
    {
        switch (node)
        {
            case JsonObject obj:
                foreach (var (key, value) in obj)
                {
                    var childPointer = pointer + "/" + Escape(key);
                    if (DataKeywords.Contains(key)) continue;
                    if (key == "pattern" && value is JsonValue v && v.TryGetValue<string>(out var pattern))
                    {
                        results.Add(new Located(childPointer, pattern, PatternLinter.Lint(pattern, options)));
                    }
                    else if (key == "patternProperties" && value is JsonObject pp)
                    {
                        foreach (var (ppKey, ppValue) in pp)
                        {
                            var ppPointer = childPointer + "/" + Escape(ppKey);
                            results.Add(new Located(ppPointer, ppKey, PatternLinter.Lint(ppKey, options)));
                            Walk(ppValue, ppPointer, options, results);
                        }
                    }
                    else
                    {
                        Walk(value, childPointer, options, results);
                    }
                }
                break;
            case JsonArray arr:
                for (var i = 0; i < arr.Count; i++)
                    Walk(arr[i], pointer + "/" + i, options, results);
                break;
        }
    }

    private static bool UseColor(TextWriter stdout) =>
        ReferenceEquals(stdout, Console.Out) && !Console.IsOutputRedirected
        && string.IsNullOrEmpty(Environment.GetEnvironmentVariable("NO_COLOR"));

    private static string Paint(bool color, string code, string text) =>
        color ? $"\u001b[{code}m{text}\u001b[0m" : text;

    /// <summary>Shows control characters as escapes; returns the display text and the display column of each UTF-16 index.</summary>
    private static (string Text, int[] Cols) Display(string pattern)
    {
        var sb = new StringBuilder();
        var cols = new int[pattern.Length + 1];
        for (var i = 0; i < pattern.Length; i++)
        {
            cols[i] = sb.Length;
            var c = pattern[i];
            sb.Append(c switch
            {
                '\n' => "\\n",
                '\r' => "\\r",
                '\t' => "\\t",
                < ' ' => $"\\x{(int)c:x2}",
                _ => c.ToString(),
            });
        }
        cols[pattern.Length] = sb.Length;
        return (sb.ToString(), cols);
    }

    private static void WriteText(TextWriter o, List<Located> withFindings, int total, int findings, int errors, int warnings)
    {
        var color = UseColor(o);
        foreach (var r in withFindings)
        {
            o.WriteLine(Paint(color, "1", r.Location.Length == 0 ? "(pattern)" : r.Location));
            var (shown, cols) = Display(r.Pattern);
            o.WriteLine("  " + shown);
            foreach (var f in r.Findings)
            {
                var start = Math.Clamp(f.Start, 0, r.Pattern.Length);
                var end = Math.Clamp(f.Start + Math.Max(f.Length, 1), start, r.Pattern.Length);
                var from = cols[start];
                var width = Math.Max(cols[end] - from, 1);
                o.WriteLine("  " + new string(' ', from) + Paint(color, SevColor(f.Severity), new string('^', width)));
                o.WriteLine($"  {f.Id} {Paint(color, SevColor(f.Severity), SevName(f.Severity).PadRight(6))} {f.Message}");
                if (f.Rewrite is not null) o.WriteLine($"  suggested: {f.Rewrite}");
            }
            o.WriteLine();
        }
        o.WriteLine($"{total} patterns, {findings} findings ({errors} errors, {warnings} warnings)");
    }

    private static string SevColor(Severity s) => s switch { Severity.Error => "31", Severity.Warning => "33", _ => "36" };

    private static void WriteJson(TextWriter o, List<Located> all, int total, int findings, int errors, int warnings, int infos)
    {
        var patterns = new JsonArray();
        foreach (var r in all)
        {
            var fs = new JsonArray();
            foreach (var f in r.Findings)
            {
                var engines = new JsonArray();
                foreach (var e in f.Engines) engines.Add(EngineName(e));
                fs.Add(new JsonObject
                {
                    ["id"] = f.Id,
                    ["severity"] = SevName(f.Severity),
                    ["start"] = f.Start,
                    ["length"] = f.Length,
                    ["title"] = f.Title,
                    ["message"] = f.Message,
                    ["rewrite"] = f.Rewrite,
                    ["engines"] = engines,
                });
            }
            patterns.Add(new JsonObject { ["location"] = r.Location, ["pattern"] = r.Pattern, ["findings"] = fs });
        }
        var doc = new JsonObject
        {
            ["version"] = 1,
            ["tool"] = "validonce",
            ["patterns"] = patterns,
            ["summary"] = new JsonObject
            {
                ["patterns"] = total,
                ["findings"] = findings,
                ["errors"] = errors,
                ["warnings"] = warnings,
                ["infos"] = infos,
            },
        };
        o.WriteLine(doc.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }
}
