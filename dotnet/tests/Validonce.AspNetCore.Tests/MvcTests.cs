// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Validonce.AspNetCore.Tests;

[ApiController]
[Route("mvc/bookings")]
public sealed class BookingsController : ControllerBase
{
    [HttpPost]
    public IActionResult Create([FromBody] Booking booking) => Ok(booking);
}

public class MvcTests
{
    private static async Task<(WebApplication App, HttpClient Client)> StartAsync(Action<ValidonceOptions>? configure = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddValidonce(configure, typeof(BookingValidator).Assembly);
        builder.Services.AddControllers().AddApplicationPart(typeof(BookingsController).Assembly);
        builder.Services.AddValidonceMvc();
        var app = builder.Build();
        app.MapControllers();
        await app.StartAsync();
        return (app, app.GetTestClient());
    }

    [Fact]
    public async Task Unknown_Controller_Returns422WithIssueList()
    {
        var (app, client) = await StartAsync();
        await using var _ = app;
        const string body = """{"plan":"pro","start":"2026-05-02","end":"2026-05-01","quantity":0}""";
        var response = await client.PostAsync("/mvc/bookings", new StringContent(body, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal((HttpStatusCode)422, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        var problem = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal(422, problem["status"]!.GetValue<int>());
        Assert.NotNull(problem["errors"]!["Company"]);

        var wire = JsonNode.Parse(body)!.AsObject();
        var expected = new JsonArray(Evaluator.Evaluate(new BookingValidator().ExportRules().Rules, wire)
            .Select(i => (JsonNode)i.ToJson()).ToArray());
        Assert.Equal(4, expected.Count);
        Assert.True(JsonNode.DeepEquals(expected, problem["validonce"]), problem["validonce"]!.ToJsonString());
    }

    [Fact]
    public async Task ValidBody_PassesThrough()
    {
        var (app, client) = await StartAsync();
        await using var _ = app;
        var response = await client.PostAsJsonAsync("/mvc/bookings", new { plan = "free", quantity = 2, email = "a@example.test" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task StatusCodeOption_IsHonored()
    {
        var (app, client) = await StartAsync(o => o.ValidationStatusCode = 400);
        await using var _ = app;
        var response = await client.PostAsJsonAsync("/mvc/bookings", new { plan = "pro", quantity = 2, email = "a@example.test" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
