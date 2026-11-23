// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using FluentValidation;
using Validonce.FluentValidation;
using Xunit;

namespace Validonce.Tests;

public sealed record Signup
{
    public string? Plan { get; init; }
    public string? Company { get; init; }
    public string? Email { get; init; }
    public DateOnly? Start { get; init; }
    public DateOnly? End { get; init; }
    public int? Quantity { get; init; }
    [JsonPropertyName("promo_code")] public string? PromoCode { get; init; }
}

public sealed class SignupValidator : ValidonceValidator<Signup>
{
    public SignupValidator()
    {
        RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessageKey("rules.company_required");
        Compare(x => x.End, CompareOp.Ge, x => x.Start).WithMessageKey("rules.end_after_start");
        Compare(x => x.Quantity, CompareOp.Ge, 1).WithMessageKey("rules.qty_min", new Dictionary<string, object?> { ["min"] = 1 });
        RequiredWhen(x => x.PromoCode, If.All(If.In(x => x.Plan, "pro", "team"), If.Not(If.Absent(x => x.Email))))
            .ServerOnly().WithRuleId("Signup.promo");
        RuleFor(x => x.Email).NotEmpty();
    }
}

public class FluentValidationTests
{
    [Fact]
    public void ExportRules_RoundTripsThroughParse_AndMatchesExpectedJson()
    {
        var exported = new SignupValidator().ExportRules();
        var expected = JsonNode.Parse("""
        {"version":1,"rules":[
         {"id":"Signup.required_when.company","kind":"required_when","field":"company",
          "when":{"eq":{"field":"plan","value":"pro"}},"message":{"key":"rules.company_required"}},
         {"id":"Signup.compare.end","kind":"compare","left":{"field":"end"},"op":"ge","right":{"field":"start"},
          "type":"date","message":{"key":"rules.end_after_start"}},
         {"id":"Signup.compare.quantity","kind":"compare","left":{"field":"quantity"},"op":"ge","right":{"value":1},
          "type":"number","message":{"key":"rules.qty_min","params":{"min":1}}},
         {"id":"Signup.promo","kind":"required_when","field":"promo_code",
          "when":{"all":[{"in":{"field":"plan","values":["pro","team"]}},{"not":{"absent":{"field":"email"}}}]},
          "message":{"key":"rules.required_when.promo_code"},"server_only":true}
        ]}
        """)!;
        Assert.True(JsonNode.DeepEquals(expected, exported.ToJson()), exported.ToJson().ToJsonString());
        var reparsed = RuleSet.Parse(exported.ToJson());
        Assert.True(JsonNode.DeepEquals(expected, reparsed.ToJson()));
    }

    [Fact]
    public void WireNames_UseCamelCase_AndJsonPropertyName()
    {
        var json = new SignupValidator().ExportRules().ToJson().ToJsonString();
        Assert.Contains("\"field\":\"company\"", json);
        Assert.Contains("\"field\":\"promo_code\"", json);
    }

    [Fact]
    public void WireNames_HonorNamingPolicyOption()
    {
        var v = new SnakeValidator();
        Assert.Contains("\"field\":\"promo_code2\"", v.ExportRules().ToJson().ToJsonString());
    }

    private sealed record Snake { public string? PromoCode2 { get; init; } public string? Plan { get; init; } }
    private sealed class SnakeValidator : ValidonceValidator<Snake>
    {
        public SnakeValidator() : base(new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower })
            => RequiredWhen(x => x.PromoCode2, If.Eq(x => x.Plan, "pro"));
    }

    [Fact]
    public void ValidationFailures_CarryIssueKeyAndPath()
    {
        var result = new SignupValidator().Validate(new Signup
        {
            Plan = "pro", Email = "a@example.test", Start = new(2026, 5, 2), End = new(2026, 5, 1), Quantity = 0,
        });
        Assert.False(result.IsValid);
        var f = result.Errors.Single(e => e.PropertyName == "Company");
        Assert.Equal("rules.company_required", f.ErrorCode);
        var issue = Assert.IsType<Issue>(f.CustomState);
        Assert.Equal("Signup.required_when.company", issue.RuleId);
        Assert.Equal(new[] { "company" }, issue.Path);
        Assert.Contains(result.Errors, e => e.PropertyName == "End" && e.ErrorCode == "rules.end_after_start");
        Assert.Contains(result.Errors, e => e.PropertyName == "Quantity");
    }

    [Fact]
    public void PropertyPath_MapsJsonPropertyNameBackToCSharp()
    {
        var result = new SignupValidator().Validate(new Signup { Plan = "pro", Company = "x", Email = "a@example.test" });
        Assert.Contains(result.Errors, e => e.PropertyName == "PromoCode");
    }

    [Fact]
    public void WithMessage_OverridesErrorMessage_DefaultIsKey()
    {
        var result = new MessageValidator().Validate(new Signup { Plan = "pro", Email = "a@example.test", Quantity = 0 });
        Assert.Equal("Company is needed on pro.", result.Errors.Single(e => e.PropertyName == "Company").ErrorMessage);
        Assert.Equal("rules.qty_min", result.Errors.Single(e => e.PropertyName == "Quantity").ErrorMessage);
    }

    private sealed class MessageValidator : ValidonceValidator<Signup>
    {
        public MessageValidator()
        {
            RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessage("Company is needed on pro.");
            Compare(x => x.Quantity, CompareOp.Ge, 1).WithMessageKey("rules.qty_min");
        }
    }

    [Fact]
    public void OrdinaryRuleFor_StillRuns()
    {
        var result = new SignupValidator().Validate(new Signup { Plan = "free" });
        Assert.Contains(result.Errors, e => e.PropertyName == "Email");
        Assert.DoesNotContain(result.Errors, e => e.CustomState is Issue);
    }

    private sealed record WithDateTime { public DateTime A { get; init; } public DateTime B { get; init; } }
    private sealed class DateTimeValidator : ValidonceValidator<WithDateTime>
    {
        public DateTimeValidator() => Compare(x => x.A, CompareOp.Lt, x => x.B);
    }

    [Fact]
    public void DateTime_IsRejectedAtConstruction()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => new DateTimeValidator());
        Assert.Contains("DateTimeOffset", ex.Message);
    }

    private sealed record WithBool { public bool A { get; init; } public bool B { get; init; } }
    private sealed class BoolValidator : ValidonceValidator<WithBool>
    {
        public BoolValidator() => Compare(x => x.A, CompareOp.Eq, x => x.B);
    }

    [Fact]
    public void UnsupportedPropertyType_IsRejected() =>
        Assert.Throws<InvalidOperationException>(() => new BoolValidator());

    private sealed record Mixed
    {
        public int N { get; init; }
        public double? D { get; init; }
        public decimal M { get; init; }
        public string S { get; init; } = "";
        public DateOnly Day { get; init; }
        public DateTimeOffset At { get; init; }
    }

    private sealed class MixedValidator : ValidonceValidator<Mixed>
    {
        public MixedValidator()
        {
            Compare(x => x.N, CompareOp.Lt, x => x.M).WithRuleId("n");
            Compare(x => x.D, CompareOp.Lt, 3.5).WithRuleId("d");
            Compare(x => x.S, CompareOp.Ne, "z").WithRuleId("s");
            Compare(x => x.Day, CompareOp.Ge, new DateOnly(2026, 1, 1)).WithRuleId("day");
            Compare(x => x.At, CompareOp.Le, DateTimeOffset.Parse("2026-01-01T00:00:00Z")).WithRuleId("at");
        }
    }

    [Fact]
    public void TypeInference_MapsClrTypesToCompareTypes()
    {
        var types = new MixedValidator().ExportRules().Rules.Cast<CompareRule>().Select(r => r.Type).ToArray();
        Assert.Equal(new[] { CompareType.Number, CompareType.Number, CompareType.String, CompareType.Date, CompareType.DateTime }, types);
        var day = (CompareRule)new MixedValidator().ExportRules().Rules[3];
        Assert.Equal("2026-01-01", day.RightValue!.GetValue<string>());
    }

    private sealed class DuplicateValidator : ValidonceValidator<Signup>
    {
        public DuplicateValidator()
        {
            Compare(x => x.Quantity, CompareOp.Ge, 1);
            Compare(x => x.Quantity, CompareOp.Le, 10);
        }
    }

    [Fact]
    public void RuleIdCollision_IsRejected_AndWithRuleIdFixesIt()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => new DuplicateValidator().ExportRules());
        Assert.Contains("Signup.compare.quantity", ex.Message);
        Assert.Equal(2, new FixedDuplicateValidator().ExportRules().Rules.Count);
    }

    private sealed class FixedDuplicateValidator : ValidonceValidator<Signup>
    {
        public FixedDuplicateValidator()
        {
            Compare(x => x.Quantity, CompareOp.Ge, 1);
            Compare(x => x.Quantity, CompareOp.Le, 10).WithRuleId("Signup.qty_max");
        }
    }

    [Fact]
    public void NestedPropertyExpression_IsRejected() =>
        Assert.Throws<ArgumentException>(() => new NestedValidator());

    private sealed record Outer { public Signup? Inner { get; init; } }
    private sealed class NestedValidator : ValidonceValidator<Outer>
    {
        public NestedValidator() => RequiredWhen(x => x.Inner!.Company, If.Present(x => x.Inner));
    }
}
