// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import com.metatoy.validonce.Condition;
import com.metatoy.validonce.Op;
import com.metatoy.validonce.RuleDefinition;
import com.metatoy.validonce.RuleSetBuilder;

/** Rules are written once, keyed by the JSON property names. */
public final class SignupRules extends RuleDefinition<Signup> {
    public SignupRules() {
        super(Signup.class);
    }

    @Override
    protected void define(RuleSetBuilder<Signup> r) {
        r.requiredWhen("company", Condition.eq("plan", "pro")).key("rules.company_required")
                .compare("end", Op.GE, "start").key("rules.end_after_start")
                .compareValue("quantity", Op.GE, 1).key("rules.quantity_min").param("min", 1);
    }
}
