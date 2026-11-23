// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Golden check, step 2 (C#): instantiate every generated validator and export its rules.
// usage: dotnet run -- <out.json>
using System.Text.Json;
using System.Text.Json.Nodes;
using Validonce.FluentValidation;

var result = new JsonObject();
var exporters = typeof(Program).Assembly.GetTypes()
    .Where(t => !t.IsAbstract && typeof(IRuleExporter).IsAssignableFrom(t))
    .OrderBy(t => t.Name, StringComparer.Ordinal);
foreach (var t in exporters)
{
    var v = (IRuleExporter)Activator.CreateInstance(t)!;
    result[v.ModelType.Name] = v.ExportRules().ToJson();
}
File.WriteAllText(args[0], result.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"exported {result.Count} validators");
