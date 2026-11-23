// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
//
// validonce-migrate runner: run a FluentValidation AbstractValidator<T> over wire-JSON inputs.
//
//   dotnet run --project dotnet-runner -- --assembly <user's built dll> --validator <full type name>
//       --model <full type name> --inputs <in.jsonl> --out <out.jsonl> [--naming camel|none]
//
// Input line: a wire JSON object, deserialized with System.Text.Json (JsonSerializerDefaults.Web, as
// ASP.NET does; --naming none turns the camelCase policy off). Output line, one per input:
//   {"accept": bool, "paths": [top-level wire field names with errors], "error"?: "..."}
//
//   * a line that does not deserialize into the model: {"accept": false, "paths": [], "error": "parse: ..."}
//     (a separate class of result: validonce's evaluate never sees such a value as a rule failure);
//   * a validator that throws: "error": "<ExceptionType>: <message>", never counted as a rejection;
//   * PropertyName -> wire name: [JsonPropertyName] / the naming policy through System.Text.Json metadata,
//     first segment only ("Address.Street" -> "address"); a rule with no property is "__root__".
//
// Exit codes: 2 usage, 3 cannot load the assembly / type / inputs, 4 validator needs constructor
// services ("cannot prove"). Run it with a scrubbed environment and no network (see ../README.md);
// the header on stderr records what it was run with.

using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;

const string Usage = "usage: dotnet-runner --assembly <dll> --validator <type> --model <type> --inputs <jsonl> --out <jsonl> [--naming camel|none]";

var opts = new Dictionary<string, string>();
for (var i = 0; i < args.Length; i += 2)
{
    if (!args[i].StartsWith("--") || i + 1 >= args.Length) { Console.Error.WriteLine(Usage); return 2; }
    opts[args[i][2..]] = args[i + 1];
}
string[] required = ["assembly", "validator", "model", "inputs", "out"];
if (required.Any(k => !opts.ContainsKey(k)) || opts.Keys.Any(k => !required.Append("naming").Contains(k)))
{ Console.Error.WriteLine(Usage); return 2; }
var naming = opts.GetValueOrDefault("naming", "camel");
if (naming is not ("camel" or "none")) { Console.Error.WriteLine(Usage); return 2; }

var asmPath = Path.GetFullPath(opts["assembly"]);
Type validatorType, modelType;
try
{
    var alc = new UserLoadContext(asmPath);
    var asm = alc.LoadFromAssemblyPath(asmPath);
    validatorType = asm.GetType(opts["validator"], throwOnError: false) ?? throw new TypeLoadException($"type {opts["validator"]} not found in {Path.GetFileName(asmPath)}");
    modelType = asm.GetType(opts["model"], throwOnError: false) ?? throw new TypeLoadException($"type {opts["model"]} not found in {Path.GetFileName(asmPath)}");
    // Touching the base type surfaces a missing dependency (e.g. FluentValidation.dll not next to the dll) as a clear error.
    _ = validatorType.BaseType;
    _ = validatorType.GetConstructors();
}
catch (Exception e)
{
    Console.Error.WriteLine($"validonce runner: cannot load {opts["assembly"]}: {e.GetType().Name}: {e.Message}");
    return 3;
}

var fvAsm = validatorType.Assembly.GetReferencedAssemblies().FirstOrDefault(a => a.Name == "FluentValidation");
var envCount = Environment.GetEnvironmentVariables().Count;
Console.Error.WriteLine(
    $"validonce-runner: run-dotnet runtime=\"{RuntimeInformation.FrameworkDescription}\" " +
    $"fluentvalidation={fvAsm?.Version?.ToString() ?? "unknown"} naming={naming} " +
    $"env: scrubbed? {(envCount <= 5 ? "yes" : "no")} ({envCount} vars) " +
    "network=not blocked by the runner (use sandbox-exec/unshare -n for a real block)");

if (validatorType.GetConstructor(Type.EmptyTypes) is null)
{
    Console.Error.WriteLine($"validonce runner: {validatorType.FullName} needs constructor services; cannot prove");
    return 4;
}

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { TypeInfoResolver = new DefaultJsonTypeInfoResolver() };
if (naming == "none") json.PropertyNamingPolicy = null;

// C# member name -> wire name, from the same metadata the deserializer uses.
var wire = new Dictionary<string, string>();
foreach (var p in json.GetTypeInfo(modelType).Properties)
    if (p.AttributeProvider is MemberInfo m) wire[m.Name] = p.Name;
string Wire(string seg) => wire.TryGetValue(seg, out var w) ? w : (naming == "camel" ? JsonNamingPolicy.CamelCase.ConvertName(seg) : seg);

var validate = validatorType.GetMethods().FirstOrDefault(m =>
    m.Name == "Validate" && m.GetParameters() is [var p] && p.ParameterType == modelType);
if (validate is null)
{
    Console.Error.WriteLine($"validonce runner: cannot load {opts["assembly"]}: {validatorType.FullName} has no Validate({modelType.Name})");
    return 3;
}

object validator;
try { validator = Activator.CreateInstance(validatorType)!; }
catch (Exception e)
{
    var inner = e is TargetInvocationException { InnerException: { } ie } ? ie : e;
    Console.Error.WriteLine($"validonce runner: cannot load {opts["assembly"]}: constructing {validatorType.Name}: {inner.GetType().Name}: {inner.Message}");
    return 3;
}

string[] lines;
try { lines = File.ReadAllLines(opts["inputs"]); }
catch (Exception e) { Console.Error.WriteLine($"validonce runner: cannot read {opts["inputs"]}: {e.Message}"); return 3; }

using var fout = new StreamWriter(opts["out"], false, new System.Text.UTF8Encoding(false));
foreach (var line in lines)
{
    if (string.IsNullOrWhiteSpace(line)) continue;
    object? model;
    try { model = JsonSerializer.Deserialize(line, modelType, json) ?? throw new JsonException("input is null"); }
    catch (Exception e)
    {
        fout.WriteLine(JsonSerializer.Serialize(new { accept = false, paths = Array.Empty<string>(), error = "parse: " + e.Message }));
        continue;
    }
    try
    {
        var result = validate.Invoke(validator, [model])!;
        var errors = ((System.Collections.IEnumerable)result.GetType().GetProperty("Errors")!.GetValue(result)!).Cast<object>().ToList();
        var paths = new List<string>();
        foreach (var err in errors)
        {
            var name = (string?)err.GetType().GetProperty("PropertyName")!.GetValue(err);
            var first = string.IsNullOrEmpty(name) ? "__root__" : Wire(name.Split('.', '[')[0]);
            if (!paths.Contains(first)) paths.Add(first);
        }
        fout.WriteLine(JsonSerializer.Serialize(new { accept = errors.Count == 0, paths }));
    }
    catch (Exception e)
    {
        var inner = e is TargetInvocationException { InnerException: { } ie } ? ie : e;
        fout.WriteLine(JsonSerializer.Serialize(new { accept = false, paths = Array.Empty<string>(), error = $"{inner.GetType().Name}: {inner.Message}" }));
    }
}
return 0;

/// <summary>Loads the user's assembly and resolves its dependencies from its own directory.</summary>
sealed class UserLoadContext(string path) : AssemblyLoadContext("validonce-user", isCollectible: false)
{
    private readonly AssemblyDependencyResolver _resolver = new(path);
    private readonly string _dir = Path.GetDirectoryName(path)!;

    protected override Assembly? Load(AssemblyName name)
    {
        var p = _resolver.ResolveAssemblyToPath(name);
        if (p is null)
        {
            var candidate = Path.Combine(_dir, name.Name + ".dll");
            if (File.Exists(candidate)) p = candidate;
        }
        return p is null ? null : LoadFromAssemblyPath(p);
    }
}
