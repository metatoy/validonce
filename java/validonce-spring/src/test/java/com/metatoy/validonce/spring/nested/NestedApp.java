// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring.nested;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.metatoy.validonce.Condition;
import com.metatoy.validonce.Op;
import com.metatoy.validonce.RuleDefinition;
import com.metatoy.validonce.RuleSetBuilder;
import com.metatoy.validonce.spring.ValidonceRules;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Test application (kept out of the test class, whose nested classes Spring Boot's scan skips). */
@SpringBootApplication
public class NestedApp {
    @ValidonceRules(AddressRules.class)
    record Address(String kind, String company) {}

    static final class AddressRules extends RuleDefinition<Address> {
        AddressRules() {
            super(Address.class);
        }

        @Override
        protected void define(RuleSetBuilder<Address> r) {
            r.requiredWhen("company", Condition.eq("kind", "biz")).key("rules.company_required");
        }
    }

    @ValidonceRules(OrderRules.class)
    record Order(
            LocalDate startDate,
            @JsonProperty("end_date") LocalDate end,
            @Valid Address billingAddress,
            @Valid List<Address> shipTo,
            @Valid Map<String, Address> byRegion) {}

    static final class OrderRules extends RuleDefinition<Order> {
        OrderRules() {
            super(Order.class);
        }

        @Override
        protected void define(RuleSetBuilder<Order> r) {
            // Wire names: start_date (naming strategy) and end_date (explicit).
            r.compare("end_date", Op.GE, "start_date").key("rules.end_after_start");
        }
    }

    @RestController
    static class Controller {
        @PostMapping("/orders")
        Map<String, Boolean> create(@Valid @RequestBody Order body) {
            return Map.of("ok", true);
        }
    }

}
