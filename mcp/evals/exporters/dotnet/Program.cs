// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Usage: dotnet Exporter.dll <assembly.dll> <ValidatorTypeName>
// Prints the rule set the validator exports, or {"error": "..."} (exit 0) when it does not export rules.
using System.Reflection;
using Validonce.FluentValidation;

var asm = Assembly.LoadFrom(Path.GetFullPath(args[0]));
var type = asm.GetType(args[1]);
if (type is null) { Console.WriteLine("{\"error\":\"validator type not found\"}"); return; }
object? instance;
try { instance = Activator.CreateInstance(type); }
catch (Exception e) { Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { error = "cannot construct: " + e.Message })); return; }
if (instance is not IRuleExporter exporter) { Console.WriteLine("{\"error\":\"validator is not a ValidonceValidator (no exported rules)\"}"); return; }
Console.WriteLine(exporter.ExportRules().ToJson().ToJsonString());
