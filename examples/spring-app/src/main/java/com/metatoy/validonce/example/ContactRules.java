// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import com.metatoy.validonce.Condition;
import com.metatoy.validonce.Op;
import com.metatoy.validonce.RuleDefinition;
import com.metatoy.validonce.RuleSetBuilder;

// playground:begin
public final class ContactRules extends RuleDefinition<Contact> {
    public ContactRules() {
        super(Contact.class);
    }

    @Override
    protected void define(RuleSetBuilder<Contact> r) {
        r.atLeastOneOf("email", "phone").key("rules.contact_email_or_phone")
                .allOrNone("street", "city", "postalCode").key("rules.address_all_or_none")
                .requiredWhen("postalCode", Condition.eq("country", "US")).key("rules.postal_code_required_us")
                .compare("availableTo", Op.GE, "availableFrom").key("rules.available_to_after_from");
    }
}
// playground:end
