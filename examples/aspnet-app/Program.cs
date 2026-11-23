// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AspNetApp;
using Validonce.AspNetCore;

var exportIdx = Array.IndexOf(args, "--export-openapi");
var builder = WebApplication.CreateBuilder(args.Where((_, i) => i != exportIdx && i != exportIdx + 1 || exportIdx < 0).ToArray());
if (builder.Configuration["urls"] is null && Environment.GetEnvironmentVariable("ASPNETCORE_URLS") is null)
    builder.WebHost.UseUrls("http://localhost:5080");

builder.Services.AddValidonce();
builder.Services.AddOpenApi(o => o.AddValidonceSchemaTransformer());
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4200", "http://127.0.0.1:4200")
    .AllowAnyHeader()
    .WithMethods("GET", "POST")));

var app = builder.Build();
app.UseCors();
app.MapOpenApi();
app.MapPost("/signups", (Signup s) => Results.Ok(new { ok = true })).WithValidonce();

if (exportIdx >= 0)
{
    // Serve the document from a throwaway in-process server on a random loopback port, save it, shut down.
    var path = args[exportIdx + 1];
    app.Urls.Clear();
    app.Urls.Add("http://127.0.0.1:0");
    app.Logger.LogInformation("Exporting OpenAPI document to {Path}", path);
    await app.StartAsync();
    var address = app.Urls.First();
    using var http = new HttpClient();
    var json = await http.GetStringAsync(address + "/openapi/v1.json");
    await app.StopAsync();
    var node = JsonNode.Parse(json)!.AsObject();
    node.Remove("servers"); // would embed the random port
    await File.WriteAllTextAsync(path, node.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n", new UTF8Encoding(false));
    return;
}

app.Run();
