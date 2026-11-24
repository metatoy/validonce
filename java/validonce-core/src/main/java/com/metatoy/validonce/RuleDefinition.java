// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The rules of one type, written once. Subclass it with a public or package-private no-argument
 * constructor; the Spring integration instantiates it from {@code @ValidonceRules(MyRules.class)}.
 *
 * <pre>{@code
 * public final class SignupRules extends RuleDefinition<Signup> {
 *     public SignupRules() { super(Signup.class); }
 *     protected void define(RuleSetBuilder<Signup> r) {
 *         r.requiredWhen("company", Condition.eq("plan", "pro")).key("rules.company_required");
 *     }
 * }
 * }</pre>
 */
public abstract class RuleDefinition<T> {
    private final Class<T> type;
    private volatile RuleSet rules;

    protected RuleDefinition(Class<T> type) {
        this.type = type;
    }

    public final Class<T> type() {
        return type;
    }

    /** Add the rules. Fields are Jackson property names. */
    protected abstract void define(RuleSetBuilder<T> rules);

    /** The built rules, checked on first call and cached. */
    public final RuleSet rules(ObjectMapper mapper) {
        RuleSet r = rules;
        if (r == null) {
            synchronized (this) {
                r = rules;
                if (r == null) {
                    RuleSetBuilder<T> b = RuleSetBuilder.forType(type, mapper);
                    define(b);
                    r = rules = b.build();
                }
            }
        }
        return r;
    }

    public final RuleSet rules() {
        return rules(new ObjectMapper());
    }
}
