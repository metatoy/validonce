// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// Runs regex fixtures on .NET's System.Text.RegularExpressions (default options, search semantics).
// Usage: dotnet run --project conformance/regex/runners/dotnet -- <fixtures-dir>
using System.Text.Json;
using System.Text.RegularExpressions;

if (args.Length != 1)
{
    Console.Error.WriteLine("usage: RegexOracle <fixtures-dir>");
    return 2;
}

static string Run(string pattern, string text)
{
    Regex re;
    try
    {
        re = new Regex(pattern, RegexOptions.None, TimeSpan.FromSeconds(1));
    }
    catch (ArgumentException)
    {
        return "error";
    }
    try
    {
        return re.IsMatch(text) ? "match" : "no-match";
    }
    catch (RegexMatchTimeoutException)
    {
        return "error";
    }
}

var results = new SortedDictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
var files = Directory.GetFiles(args[0], "*.json", SearchOption.TopDirectoryOnly);
Array.Sort(files, StringComparer.Ordinal);
foreach (var file in files)
{
    using var doc = JsonDocument.Parse(File.ReadAllText(file));
    foreach (var c in doc.RootElement.GetProperty("cases").EnumerateArray())
    {
        var id = c.GetProperty("id").GetString()!;
        var pattern = c.GetProperty("pattern").GetString()!;
        var i = 0;
        foreach (var inp in c.GetProperty("inputs").EnumerateArray())
        {
            results[$"{id}#{i}"] = new Dictionary<string, string>
            {
                ["dotnet"] = Run(pattern, inp.GetProperty("text").GetString()!),
            };
            i++;
        }
    }
}

var output = new
{
    engineVersions = new Dictionary<string, string>
    {
        ["dotnet-runtime"] = Environment.Version.ToString(),
        ["dotnet-framework"] = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
    },
    results,
};
var json = JsonSerializer.Serialize(output, new JsonSerializerOptions
{
    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
}).Replace("\"engineVersions\"", "\"engine-versions\"");
Console.Out.WriteLine(json);
return 0;
