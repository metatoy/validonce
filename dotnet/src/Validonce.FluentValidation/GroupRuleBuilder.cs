// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Linq.Expressions;

namespace Validonce.FluentValidation;

/// <summary>Options for a group rule (<c>AtLeastOneOf</c>, <c>ExactlyOneOf</c>, <c>AllOrNone</c>).</summary>
public sealed class GroupRuleBuilder<T> : ValidonceRuleBuilder
{
    private readonly WireNames _wire;

    internal GroupRuleBuilder(string kind, string field, WireNames wire, Func<string, RuleMessage, bool, Rule> build)
        : base(kind, field, build) => _wire = wire;

    internal string? PathOverride { get; private set; }

    /// <summary>Reports the issue on this property instead of the first listed field.</summary>
    public GroupRuleBuilder<T> AtPath<TProp>(Expression<Func<T, TProp>> property)
    {
        PathOverride = _wire.WireName(_wire.Property(property));
        return this;
    }

    /// <inheritdoc cref="ValidonceRuleBuilder.WithMessageKey" />
    public new GroupRuleBuilder<T> WithMessageKey(string key, IReadOnlyDictionary<string, object?>? parameters = null)
    { base.WithMessageKey(key, parameters); return this; }

    /// <inheritdoc cref="ValidonceRuleBuilder.WithRuleId" />
    public new GroupRuleBuilder<T> WithRuleId(string id) { base.WithRuleId(id); return this; }

    /// <inheritdoc cref="ValidonceRuleBuilder.ServerOnly" />
    public new GroupRuleBuilder<T> ServerOnly() { base.ServerOnly(); return this; }

    /// <inheritdoc cref="ValidonceRuleBuilder.WithMessage" />
    public new GroupRuleBuilder<T> WithMessage(string message) { base.WithMessage(message); return this; }
}
