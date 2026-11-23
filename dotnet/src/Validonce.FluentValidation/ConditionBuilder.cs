// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Linq.Expressions;

namespace Validonce.FluentValidation;

/// <summary>A condition for <c>RequiredWhen</c>, built from property expressions.</summary>
public sealed class Cond<T>
{
    internal Cond(Condition condition) => Condition = condition;
    internal Condition Condition { get; }
}

/// <summary>
/// Builds conditions (<c>Eq/Ne/In/Present/Absent/All/Any/Not</c>). Reach it as <c>If</c> inside a
/// <see cref="ValidonceValidator{T}"/>: <c>If.Eq(x =&gt; x.Plan, "pro")</c>.
/// </summary>
public sealed class ConditionBuilder<T>
{
    private readonly WireNames _wire;
    internal ConditionBuilder(WireNames wire) => _wire = wire;

    private string Field<TProp>(Expression<Func<T, TProp>> e) => _wire.WireName(_wire.Property(e));

    /// <summary>The property equals the value.</summary>
    public Cond<T> Eq<TProp>(Expression<Func<T, TProp>> field, TProp value) =>
        new(new Condition.Eq(Field(field), _wire.Scalar(value)));

    /// <summary>The property does not equal the value.</summary>
    public Cond<T> Ne<TProp>(Expression<Func<T, TProp>> field, TProp value) =>
        new(new Condition.Ne(Field(field), _wire.Scalar(value)));

    /// <summary>The property equals one of the values.</summary>
    public Cond<T> In<TProp>(Expression<Func<T, TProp>> field, params TProp[] values)
    {
        if (values.Length == 0) throw new ArgumentException("In needs at least one value", nameof(values));
        return new(new Condition.In(Field(field), values.Select(v => _wire.Scalar(v)).ToList()));
    }

    /// <summary>The property is not blank (not null, empty or whitespace).</summary>
    public Cond<T> Present<TProp>(Expression<Func<T, TProp>> field) => new(new Condition.Present(Field(field)));

    /// <summary>The property is blank.</summary>
    public Cond<T> Absent<TProp>(Expression<Func<T, TProp>> field) => new(new Condition.Absent(Field(field)));

    /// <summary>Every condition holds.</summary>
    public Cond<T> All(params Cond<T>[] items) => new(new Condition.All(NonEmpty(items)));

    /// <summary>At least one condition holds.</summary>
    public Cond<T> Any(params Cond<T>[] items) => new(new Condition.Any(NonEmpty(items)));

    /// <summary>The condition does not hold.</summary>
    public Cond<T> Not(Cond<T> inner) => new(new Condition.Not(inner.Condition));

    private static List<Condition> NonEmpty(Cond<T>[] items) =>
        items.Length == 0 ? throw new ArgumentException("needs at least one condition") : items.Select(i => i.Condition).ToList();
}
