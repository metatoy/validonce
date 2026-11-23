// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Linq.Expressions;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using FluentValidation;
using FluentValidation.Results;

namespace Validonce.FluentValidation;

/// <summary>
/// A FluentValidation validator whose cross-field rules are written once and become both real validation
/// rules and rule-format data (<see cref="ExportRules"/>).
/// </summary>
public abstract class ValidonceValidator<T> : AbstractValidator<T>, IRuleExporter
{
    /// <summary>
    /// The options used when none are passed: <see cref="JsonSerializerDefaults.Web"/> (camelCase wire names).
    /// This instance is read-only. To change wire names, pass your own <see cref="JsonSerializerOptions"/>
    /// to the validator's constructor.
    /// </summary>
    public static JsonSerializerOptions DefaultJsonOptions { get; } = CreateDefaultOptions();

    private static JsonSerializerOptions CreateDefaultOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.MakeReadOnly(populateMissingResolver: true);
        return options;
    }

    private readonly WireNames _wire;
    private readonly List<ValidonceRuleBuilder> _builders = new();
    private RuleSet? _exported;
    private Dictionary<string, string>? _wireToProperty;

    /// <summary>Creates the validator with the default wire-name options (camelCase).</summary>
    protected ValidonceValidator() : this(null) { }

    /// <param name="jsonOptions">The options the API serializes with; they decide wire names.</param>
    protected ValidonceValidator(JsonSerializerOptions? jsonOptions)
    {
        _wire = new WireNames(jsonOptions ?? DefaultJsonOptions);
        If = new ConditionBuilder<T>(_wire);
        RuleFor(x => x).Custom(RunCrossFieldRules);
    }

    /// <summary>Builds conditions: <c>If.Eq(x =&gt; x.Plan, "pro")</c>. (Named <c>If</c> because <c>When</c> is a FluentValidation method.)</summary>
    protected ConditionBuilder<T> If { get; }

    /// <inheritdoc />
    public Type ModelType => typeof(T);

    /// <summary>The field is required (not blank) whenever the condition holds.</summary>
    protected ValidonceRuleBuilder RequiredWhen<TProp>(Expression<Func<T, TProp>> field, Cond<T> when)
    {
        var f = _wire.WireName(_wire.Property(field));
        return Add(new ValidonceRuleBuilder("required_when", f,
            (id, msg, so) => new RequiredWhenRule(id, null, msg, so, f, when.Condition)));
    }

    /// <summary>Compares two properties. The compare type is inferred from the property type.</summary>
    protected ValidonceRuleBuilder Compare<TLeft, TRight>(
        Expression<Func<T, TLeft>> left, CompareOp op, Expression<Func<T, TRight>> right)
    {
        var l = _wire.WireName(_wire.Property(left));
        var r = _wire.WireName(_wire.Property(right));
        var type = InferType(typeof(TLeft));
        if (InferType(typeof(TRight)) != type)
            throw new InvalidOperationException(
                $"Compare on {typeof(T).Name}.{l} vs {r}: the properties have different compare types ({type} vs {InferType(typeof(TRight))}).");
        return Add(new ValidonceRuleBuilder("compare", l,
            (id, msg, so) => new CompareRule(id, null, msg, so, l, op, r, null, type)));
    }

    /// <summary>Compares a property with a constant (a number, string, <see cref="DateOnly"/> or <see cref="DateTimeOffset"/>).</summary>
    protected ValidonceRuleBuilder Compare<TLeft, TValue>(Expression<Func<T, TLeft>> left, CompareOp op, TValue value)
    {
        var l = _wire.WireName(_wire.Property(left));
        var type = InferType(typeof(TLeft));
        if (InferType(typeof(TValue)) != type)
            throw new InvalidOperationException(
                $"Compare on {typeof(T).Name}.{l}: the constant is a {typeof(TValue).Name}, which is not a {type} comparison.");
        var node = _wire.Scalar(value);
        return Add(new ValidonceRuleBuilder("compare", l,
            (id, msg, so) => new CompareRule(id, null, msg, so, l, op, null, node, type)));
    }

    /// <summary>Fails when every listed field is blank.</summary>
    protected GroupRuleBuilder<T> AtLeastOneOf(params Expression<Func<T, object?>>[] fields) => Group("at_least_one_of", fields);

    /// <summary>Fails unless exactly one listed field is non-blank.</summary>
    protected GroupRuleBuilder<T> ExactlyOneOf(params Expression<Func<T, object?>>[] fields) => Group("exactly_one_of", fields);

    /// <summary>Fails when some, but not all, listed fields are blank.</summary>
    protected GroupRuleBuilder<T> AllOrNone(params Expression<Func<T, object?>>[] fields) => Group("all_or_none", fields);

    private GroupRuleBuilder<T> Group(string kind, Expression<Func<T, object?>>[] fields)
    {
        if (fields is null || fields.Length < 2)
            throw new ArgumentException($"{kind} needs at least 2 fields", nameof(fields));
        var names = fields.Select(e => _wire.WireName(_wire.Property(e))).ToList();
        if (names.Distinct(StringComparer.Ordinal).Count() != names.Count)
            throw new ArgumentException($"{kind} fields must be distinct", nameof(fields));
        GroupRuleBuilder<T>? b = null;
        b = new GroupRuleBuilder<T>(kind, names[0], _wire,
            (id, msg, so) => new GroupRule(id, kind, b!.PathOverride, msg, so, names));
        Add(b);
        return b;
    }

    /// <summary>The rule-format data (version 1) for this validator's cross-field rules.</summary>
    public RuleSet ExportRules() => _exported ??= Finish();

    internal static CompareType InferType(Type t)
    {
        var u = Nullable.GetUnderlyingType(t) ?? t;
        if (u == typeof(int) || u == typeof(long) || u == typeof(decimal) || u == typeof(double) || u == typeof(float)
            || u == typeof(short) || u == typeof(byte) || u == typeof(sbyte) || u == typeof(ushort)
            || u == typeof(uint) || u == typeof(ulong))
            return CompareType.Number;
        if (u == typeof(string)) return CompareType.String;
        if (u == typeof(DateOnly)) return CompareType.Date;
        if (u == typeof(DateTimeOffset)) return CompareType.DateTime;
        if (u == typeof(DateTime))
            throw new InvalidOperationException(
                "DateTime cannot be used in a compare rule because it carries no UTC offset. " +
                "Use DateTimeOffset for an instant, or DateOnly for a calendar date.");
        throw new InvalidOperationException($"{t.Name} is not supported in a compare rule (use a number, string, DateOnly or DateTimeOffset).");
    }

    private ValidonceRuleBuilder Add(ValidonceRuleBuilder b)
    {
        _builders.Add(b);
        _exported = null;
        return b;
    }

    private RuleSet Finish()
    {
        var model = typeof(T).Name;
        var tick = model.IndexOf('`');
        if (tick >= 0) model = model[..tick];
        var rules = new List<Rule>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var b in _builders)
        {
            var id = b.RuleId ?? $"{model}.{b.Kind}.{b.Field}";
            if (!seen.Add(id))
                throw new InvalidOperationException(
                    $"{GetType().Name}: duplicate rule id '{id}'. Give one of the rules a unique id with .WithRuleId(...).");
            var msg = new RuleMessage(b.MessageKey ?? $"rules.{b.Kind}.{b.Field}", b.Params);
            rules.Add(b.Build(id, msg, b.IsServerOnly));
        }
        return new RuleSet(1, rules);
    }

    private void RunCrossFieldRules(T instance, ValidationContext<T> context)
    {
        var rules = ExportRules();
        if (rules.Rules.Count == 0) return;
        var json = System.Text.Json.JsonSerializer.SerializeToNode(instance, typeof(T), _wire.Options) as JsonObject
            ?? throw new InvalidOperationException($"{typeof(T).Name} does not serialize to a JSON object");
        var byId = rules.Rules.Zip(_builders).ToDictionary(p => p.First.Id, p => p.Second.ErrorMessage);
        foreach (var issue in Evaluator.Evaluate(rules.Rules, json, EvaluationSide.Server))
        {
            var wirePath = issue.Path[0];
            var prop = WireToProperty().GetValueOrDefault(wirePath, wirePath);
            var message = byId.GetValueOrDefault(issue.RuleId) ?? issue.Key;
            context.AddFailure(new ValidationFailure(context.PropertyChain.BuildPropertyPath(prop), message)
            {
                ErrorCode = issue.Key,
                CustomState = issue,
            });
        }
    }

    private Dictionary<string, string> WireToProperty() =>
        _wireToProperty ??= typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .GroupBy(p => _wire.WireName(p)).ToDictionary(g => g.Key, g => g.First().Name);
}
