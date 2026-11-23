// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Validonce;
using Validonce.AspNetCore;
using Validonce.FluentValidation;
using Xunit;

namespace Validonce.AspNetCore.Tests;

public sealed record Booking
{
    public string? Plan { get; init; }
    public string? Company { get; init; }
    public DateOnly? Start { get; init; }
    public DateOnly? End { get; init; }
    public int? Quantity { get; init; }
}

public sealed class BookingValidator : ValidonceValidator<Booking>
{
    public BookingValidator()
    {
        RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessageKey("rules.company_required");
        Compare(x => x.End, CompareOp.Ge, x => x.Start).WithMessageKey("rules.end_after_start");
        Compare(x => x.Quantity, CompareOp.Ge, 1).WithMessageKey("rules.qty_min");
    }
}

public class AspNetCoreTests
{
    private static async Task<(WebApplication App, HttpClient Client)> StartAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddValidonce(typeof(BookingValidator).Assembly);
        builder.Services.AddOpenApi(o => o.AddValidonceSchemaTransformer());
        var app = builder.Build();
        app.MapOpenApi();
        app.MapPost("/bookings", (Booking b) => Results.Ok(b)).WithValidonce();
        await app.StartAsync();
        return (app, app.GetTestClient());
    }

    [Fact]
    public async Task Unknown_SchemaTransformer_WritesXValidonce()
    {
        var (app, client) = await StartAsync();
        await using var _ = app;
        var doc = JsonNode.Parse(await client.GetStringAsync("/openapi/v1.json"))!;
        var xv = doc["components"]!["schemas"]!["Booking"]!["x-validonce"];
        Assert.NotNull(xv);
        Assert.Equal(1, xv!["version"]!.GetValue<int>());
        Assert.True(JsonNode.DeepEquals(new BookingValidator().ExportRules().ToJson(), xv), xv.ToJsonString());
    }

    [Fact]
    public async Task Unknown_ProblemDetails_CarriesIssueList()
    {
        var (app, client) = await StartAsync();
        await using var _ = app;
        const string body = """{"plan":"pro","start":"2026-05-02","end":"2026-05-01","quantity":0}""";
        var response = await client.PostAsync("/bookings", new StringContent(body, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal((HttpStatusCode)422, response.StatusCode);
        var problem = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal(422, problem["status"]!.GetValue<int>());
        Assert.NotNull(problem["errors"]);

        var wire = JsonNode.Parse(body)!.AsObject();
        var expected = new JsonArray(Evaluator.Evaluate(new BookingValidator().ExportRules().Rules, wire)
            .Select(i => (JsonNode)i.ToJson()).ToArray());
        Assert.Equal(3, expected.Count);
        Assert.True(JsonNode.DeepEquals(expected, problem["validonce"]), problem["validonce"]!.ToJsonString());
        Assert.NotNull(problem["errors"]!["Company"]);
    }

    [Fact]
    public async Task ValidBody_PassesThrough()
    {
        var (app, client) = await StartAsync();
        await using var _ = app;
        var response = await client.PostAsJsonAsync("/bookings", new { plan = "free", quantity = 2 });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
