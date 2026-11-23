// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Linq.Expressions;

namespace Validonce.FluentValidation;

/// <summary>Options for a <c>RequiredWhen</c> or <c>Compare</c> rule.</summary>
public sealed class RuleBuilder<T> : ValidonceRuleBuilder
{
    private readonly WireNames _wire;

    internal RuleBuilder(string kind, string field, WireNames wire, Func<string, RuleMessage, bool, Rule> build)
        : base(kind, field, build) => _wire = wire;

    internal string? PathOverride { get; private set; }

    /// <summary>Reports the issue on this property instead of the rule's default (the required field, or the left side of a comparison).</summary>
    public RuleBuilder<T> AtPath<TProp>(Expression<Func<T, TProp>> property)
    {
        PathOverride = _wire.WireName(_wire.Property(property));
        return this;
    }

    /// <inheritdoc cref="ValidonceRuleBuilder.WithMessageKey" />
    public new RuleBuilder<T> WithMessageKey(string key, IReadOnlyDictionary<string, object?>? parameters = null)
    { base.WithMessageKey(key, parameters); return this; }

    /// <inheritdoc cref="ValidonceRuleBuilder.WithRuleId" />
    public new RuleBuilder<T> WithRuleId(string id) { base.WithRuleId(id); return this; }

    /// <inheritdoc cref="ValidonceRuleBuilder.ServerOnly" />
    public new RuleBuilder<T> ServerOnly() { base.ServerOnly(); return this; }

    /// <inheritdoc cref="ValidonceRuleBuilder.WithMessage" />
    public new RuleBuilder<T> WithMessage(string message) { base.WithMessage(message); return this; }
}
