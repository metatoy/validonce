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
    .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4200", "http://127.0.0.1:4200",
        "https://playground.metatoy.com", "http://localhost:5180")
    .AllowAnyHeader()
    .WithMethods("GET", "POST")));

var app = builder.Build();
app.UseCors();

// POST /contacts accepts at most 16 KB. Kestrel enforces the limit on the stream (covers chunked
// bodies); the Content-Length check rejects an oversized declared body before any read, and also
// works under the in-process test server, which has no size-limit feature.
const long ContactBodyLimit = 16 * 1024;
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/contacts"))
    {
        if (ctx.Request.ContentLength > ContactBodyLimit)
        {
            ctx.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
            return;
        }
        var limit = ctx.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>();
        if (limit is { IsReadOnly: false }) limit.MaxRequestBodySize = ContactBodyLimit;
        if (ctx.Request.ContentLength is null && ctx.Request.Body != Stream.Null)
        {
            // Chunked or streamed: read at most limit + 1 bytes, so the cap holds on any server.
            var buffer = new MemoryStream();
            var chunk = new byte[4096];
            int n;
            while ((n = await ctx.Request.Body.ReadAsync(chunk)) > 0)
            {
                buffer.Write(chunk, 0, n);
                if (buffer.Length > ContactBodyLimit)
                {
                    ctx.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
                    return;
                }
            }
            buffer.Position = 0;
            ctx.Request.Body = buffer;
        }
    }
    await next();
});
app.MapOpenApi();
app.MapPost("/signups", (Signup s) => Results.Ok(new { ok = true })).WithValidonce();
// Stateless: stores nothing and never logs the body.
app.MapPost("/contacts", (Contact c) => Results.Ok(new { ok = true })).WithValidonce();

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

// Lets the test project host the app in-process.
public partial class Program { }
