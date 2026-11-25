// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace AspNetApp.Tests;

public sealed class ContactTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _http = factory.CreateClient();

    private static JsonObject Valid() => new()
    {
        ["email"] = "a@example.com",
        ["country"] = "CA",
    };

    private async Task<(HttpStatusCode, JsonNode?)> Post(JsonObject body)
    {
        var r = await _http.PostAsJsonAsync("/contacts", body);
        var text = await r.Content.ReadAsStringAsync();
        return (r.StatusCode, text.Length == 0 ? null : JsonNode.Parse(text));
    }

    private static JsonObject Issue(JsonNode? body, string ruleId)
    {
        var issues = body!["validonce"]?.AsArray();
        Assert.NotNull(issues);
        return issues!.Select(i => i!.AsObject()).Single(i => (string?)i["ruleId"] == ruleId);
    }

    [Fact]
    public async Task Valid_contact_is_200()
    {
        var (status, body) = await Post(Valid());
        Assert.Equal(HttpStatusCode.OK, status);
        Assert.True((bool)body!["ok"]!);
    }

    [Theory]
    [InlineData("Contact.at_least_one_of.email", "rules.contact_email_or_phone", "email")]
    [InlineData("Contact.all_or_none.street", "rules.address_all_or_none", "street")]
    [InlineData("Contact.required_when.postalCode", "rules.postal_code_required_us", "postalCode")]
    [InlineData("Contact.compare.availableTo", "rules.available_to_after_from", "availableTo")]
    public async Task Broken_rule_is_422_with_issue(string ruleId, string key, string path)
    {
        var b = Valid();
        switch (ruleId)
        {
            case "Contact.at_least_one_of.email": b.Remove("email"); break;
            case "Contact.all_or_none.street": b["street"] = "1 Main St"; break;
            case "Contact.required_when.postalCode": b["country"] = "US"; break;
            default: b["availableFrom"] = "2026-02-01"; b["availableTo"] = "2026-01-01"; break;
        }
        var (status, body) = await Post(b);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, status);
        var issue = Issue(body, ruleId);
        Assert.Equal(key, (string?)issue["key"]);
        Assert.Equal([path], issue["path"]!.AsArray().Select(p => (string)p!).ToArray());
    }

    [Fact]
    public async Task Oversized_body_is_rejected()
    {
        var b = Valid();
        b["street"] = new string('x', 20_000);
        var r = await _http.PostAsync("/contacts", new StringContent(b.ToJsonString(), Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, r.StatusCode);
    }

    private sealed class ChunkedContent(byte[] data) : HttpContent
    {
        protected override async Task SerializeToStreamAsync(Stream stream, System.Net.TransportContext? context)
        {
            for (var i = 0; i < data.Length; i += 2048)
                await stream.WriteAsync(data.AsMemory(i, Math.Min(2048, data.Length - i)));
        }
        protected override bool TryComputeLength(out long length) { length = 0; return false; }
    }

    [Fact]
    public async Task Oversized_chunked_body_is_rejected()
    {
        var b = Valid();
        b["street"] = new string('x', 20_000);
        var content = new ChunkedContent(Encoding.UTF8.GetBytes(b.ToJsonString()));
        content.Headers.ContentType = new("application/json");
        var r = await _http.PostAsync("/contacts", content);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, r.StatusCode);
    }

    [Fact]
    public async Task Small_chunked_body_is_200()
    {
        var content = new ChunkedContent(Encoding.UTF8.GetBytes(Valid().ToJsonString()));
        content.Headers.ContentType = new("application/json");
        var r = await _http.PostAsync("/contacts", content);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
    }
}
