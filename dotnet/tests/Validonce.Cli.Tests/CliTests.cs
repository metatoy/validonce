// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;
using Validonce.Cli;
using Xunit;

namespace Validonce.Cli.Tests;

public sealed class CliTests
{
    private const string Doc = """
        {
          "openapi": "3.1.0",
          "info": { "title": "t", "version": "1" },
          "paths": {
            "/users": {
              "get": {
                "parameters": [
                  { "name": "q", "in": "query", "schema": { "type": "string", "pattern": "^(?=a)b$" } }
                ],
                "responses": {}
              }
            }
          },
          "components": {
            "schemas": {
              "Signup": {
                "type": "object",
                "properties": {
                  "name": { "type": "string", "pattern": "^\\w+$" },
                  "tags": { "type": "array", "items": { "type": "string", "pattern": "^\\d+$" } },
                  "ok": { "type": "string", "pattern": "^[A-Za-z]+$", "example": { "pattern": "^\\w$" } }
                },
                "patternProperties": { "^x-\\w+$": { "type": "string" } }
              }
            }
          },
          "$defs": { "Code": { "type": "string", "pattern": "\\d{3}" } }
        }
        """;

    private static (int Code, string Out, string Err) Run(string? stdin, params string[] args)
    {
        var o = new StringWriter();
        var e = new StringWriter();
        var code = Program.Run(args, o, e, new StringReader(stdin ?? ""));
        return (code, o.ToString(), e.ToString());
    }

    private static string TempFile(string content)
    {
        var path = Path.Combine(Path.GetTempPath(), $"validonce-{Guid.NewGuid():N}.json");
        File.WriteAllText(path, content);
        return path;
    }

    private static JsonNode Json(string s) => JsonNode.Parse(s)!;

    [Fact]
    public void Walks_document_and_reports_pointers()
    {
        var (code, o, _) = Run(Doc, "lint-regex", "-", "--format", "json");
        var root = Json(o);
        var locations = root["patterns"]!.AsArray().Select(p => p!["location"]!.GetValue<string>()).ToList();

        Assert.Contains("/paths/~1users/get/parameters/0/schema/pattern", locations);
        Assert.Contains("/components/schemas/Signup/properties/name/pattern", locations);
        Assert.Contains("/components/schemas/Signup/properties/tags/items/pattern", locations);
        Assert.Contains("/components/schemas/Signup/properties/ok/pattern", locations);
        Assert.Contains("/components/schemas/Signup/patternProperties/^x-\\w+$", locations);
        Assert.Contains("/$defs/Code/pattern", locations);
        Assert.Equal(6, locations.Count); // the "pattern" inside example is data, not a keyword
        Assert.Equal(1, code);
    }

    [Fact]
    public void Json_shape()
    {
        var (_, o, _) = Run(null, "lint-regex", "--pattern", @"^\w+$", "--format", "json");
        var root = Json(o);
        Assert.Equal(1, root["version"]!.GetValue<int>());
        Assert.Equal("validonce", root["tool"]!.GetValue<string>());
        var p = root["patterns"]!.AsArray().Single()!;
        Assert.Equal(@"^\w+$", p["pattern"]!.GetValue<string>());
        var f = p["findings"]!.AsArray().First(x => x!["id"]!.GetValue<string>() == "VR001")!;
        Assert.Equal("error", f["severity"]!.GetValue<string>());
        Assert.Equal(1, f["start"]!.GetValue<int>());
        Assert.Equal(2, f["length"]!.GetValue<int>());
        Assert.Equal("[A-Za-z0-9_]", f["rewrite"]!.GetValue<string>());
        var engines = f["engines"]!.AsArray().Select(x => x!.GetValue<string>()).ToList();
        Assert.Contains("dotnet", engines);
        Assert.True(root["summary"]!["errors"]!.GetValue<int>() >= 1);
    }

    [Fact]
    public void Text_output_has_caret_message_and_summary()
    {
        var (code, o, _) = Run(null, "lint-regex", "--pattern", @"^\w+$");
        Assert.Contains("VR001 error", o);
        Assert.Contains("  ^\\w+$", o);
        Assert.Contains("   ^^", o);
        Assert.Contains("suggested: [A-Za-z0-9_]", o);
        Assert.Matches(@"1 patterns, \d+ findings \(\d+ errors, \d+ warnings\)", o);
        Assert.Equal(1, code);
    }

    [Fact]
    public void Engines_filter_removes_findings()
    {
        // A lookahead is rejected only by rust-regex, so it is a finding for rust-regex but not for js + dotnet.
        var (code, o, _) = Run(null, "lint-regex", "--pattern", "(?=a)b", "--engines", "js,dotnet", "--format", "json");
        Assert.Equal(0, code);
        Assert.Empty(Json(o)["patterns"]![0]!["findings"]!.AsArray());

        var (code2, o2, _) = Run(null, "lint-regex", "--pattern", "(?=a)b", "--engines", "rust-regex", "--format", "json");
        Assert.Equal(1, code2);
        var ids = Json(o2)["patterns"]![0]!["findings"]!.AsArray().Select(f => f!["id"]!.GetValue<string>());
        Assert.Contains("VR009", ids);
    }

    [Fact]
    public void Unknown_engine_is_usage_error()
    {
        var (code, _, err) = Run(null, "lint-regex", "--pattern", "a", "--engines", "perl");
        Assert.Equal(2, code);
        Assert.Contains("unknown engine", err);
    }

    [Theory]
    [InlineData(@"^\w+$", "error", 1)]       // error finding
    [InlineData(@"^\w+$", "never", 0)]
    [InlineData(@"\bé", "error", 0)]         // VR004 is only a warning
    [InlineData(@"\bé", "warning", 1)]
    [InlineData(@"[A-Za-z]+", "info", 0)]  // clean
    public void Fail_on_exit_codes(string pattern, string failOn, int expected)
    {
        var (code, _, _) = Run(null, "lint-regex", "--pattern", pattern, "--fail-on", failOn);
        Assert.Equal(expected, code);
    }

    [Fact]
    public void Default_fail_on_is_error_so_warnings_do_not_fail()
    {
        var (code, o, _) = Run(null, "lint-regex", "--pattern", @"\bé");
        Assert.Equal(0, code);
        Assert.Contains("VR004 warning", o);
        Assert.Equal(1, Run(null, "lint-regex", "--pattern", @"^\w+").Code);
    }

    [Fact]
    public void Ignore_drops_findings_before_reporting_and_exit_code()
    {
        Assert.Equal(1, Run(null, "lint-regex", "--pattern", @"^\w+").Code);
        var (code, o, _) = Run(null, "lint-regex", "--pattern", @"^\w+", "--ignore", "VR001", "--format", "json");
        Assert.Equal(0, code);
        Assert.DoesNotContain("VR001", o);

        var (code2, o2, _) = Run(null, "lint-regex", "--pattern", @"abc$", "--ignore", "vr005,VR014", "--fail-on", "warning");
        Assert.Equal(0, code2);
        Assert.Contains("0 findings", o2);
        Assert.Equal(1, Run(null, "lint-regex", "--pattern", @"abc$", "--fail-on", "warning").Code);
    }

    [Fact]
    public void Invalid_json_is_exit_2()
    {
        var (code, _, err) = Run("{ not json", "lint-regex", "-");
        Assert.Equal(2, code);
        Assert.Contains("invalid JSON", err);
    }

    [Fact]
    public void Missing_file_is_exit_2()
    {
        var (code, _, err) = Run(null, "lint-regex", Path.Combine(Path.GetTempPath(), "validonce-missing-file.json"));
        Assert.Equal(2, code);
        Assert.Contains("cannot read", err);
    }

    [Fact]
    public void Reads_file_argument()
    {
        var path = TempFile(Doc);
        try
        {
            var (code, o, _) = Run(null, "lint-regex", path, "--format", "json");
            Assert.Equal(1, code);
            Assert.Equal(6, Json(o)["summary"]!["patterns"]!.GetValue<int>());
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void Aspnet_golden_patterns_are_located()
    {
        var dir = AppContext.BaseDirectory;
        while (dir is not null && !File.Exists(Path.Combine(dir, "conformance", "golden", "aspnet.openapi.json")))
            dir = Path.GetDirectoryName(dir);
        Assert.NotNull(dir);
        var file = Path.Combine(dir!, "conformance", "golden", "aspnet.openapi.json");
        var expected = System.Text.RegularExpressions.Regex.Matches(File.ReadAllText(file), "\"pattern\"\\s*:\\s*\"").Count;
        var (code, o, _) = Run(null, "lint-regex", file, "--format", "json", "--fail-on", "never");
        Assert.Equal(0, code);
        var root = Json(o);
        Assert.Equal(expected, root["summary"]!["patterns"]!.GetValue<int>());
        Assert.All(root["patterns"]!.AsArray(), p => Assert.StartsWith("/components/schemas/", p!["location"]!.GetValue<string>()));
    }

    [Fact]
    public void No_args_prints_usage_and_exits_2()
    {
        var (code, o, _) = Run(null);
        Assert.Equal(2, code);
        Assert.Contains("Usage:", o);
    }

    [Fact]
    public void Help_exits_0()
    {
        var (code, o, _) = Run(null, "--help");
        Assert.Equal(0, code);
        Assert.Contains("lint-regex", o);
    }

    [Fact]
    public void Version_prints_version()
    {
        var (code, o, _) = Run(null, "--version");
        Assert.Equal(0, code);
        Assert.Matches(@"^\d+\.\d+\.\d+", o);
    }

    [Fact]
    public void Findings_lists_table()
    {
        var (code, o, _) = Run(null, "findings");
        Assert.Equal(0, code);
        Assert.Contains("VR001", o);
        Assert.Contains("error", o);
    }

    [Fact]
    public void Unknown_command_and_conflicting_inputs_are_usage_errors()
    {
        Assert.Equal(2, Run(null, "bogus").Code);
        Assert.Equal(2, Run(null, "lint-regex").Code);
        Assert.Equal(2, Run(null, "lint-regex", "x.json", "--pattern", "a").Code);
    }
}
