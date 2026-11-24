// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class BuilderTest {
    record Signup(
            String plan,
            String company,
            @JsonProperty("start_date") LocalDate start,
            LocalDate end,
            int quantity,
            boolean flag,
            LocalDateTime naive) {}

    private static RuleSetBuilder<Signup> b() {
        return RuleSetBuilder.forType(Signup.class);
    }

    @Test
    void buildsTheSignupRulesWithDefaultIds() {
        JsonNode json = b().requiredWhen("company", Condition.eq("plan", "pro")).key("rules.company_required")
                .compare("end", Op.GE, "start_date").key("rules.end_after_start")
                .compareValue("quantity", Op.GE, 1).key("rules.quantity_min").param("min", 1)
                .build().toJson();
        JsonNode rules = json.get("rules");
        assertThat(rules.get(0).get("id").asText()).isEqualTo("Signup.required_when.company");
        assertThat(rules.get(1).get("id").asText()).isEqualTo("Signup.compare.end");
        assertThat(rules.get(1).get("type").asText()).isEqualTo("date");
        assertThat(rules.get(2).get("right").get("value").toString()).isEqualTo("1");
        assertThat(rules.get(2).get("message").get("params").toString()).isEqualTo("{\"min\":1}");
        // The output is valid input.
        assertThat(RuleSet.fromJson(json).toJson()).isEqualTo(json);
    }

    @Test
    void unknownFieldFails() {
        assertThatThrownBy(() -> b().compare("end", Op.GE, "start").build())
                .isInstanceOf(ValidonceDefinitionException.class)
                .hasMessageContaining("no JSON property 'start'")
                .hasMessageContaining("start_date");
        assertThatThrownBy(() -> b().requiredWhen("company", Condition.eq("nope", "x")).build())
                .isInstanceOf(ValidonceDefinitionException.class);
    }

    @Test
    void unsupportedCompareTypeFails() {
        assertThatThrownBy(() -> b().compareValue("flag", Op.GE, 1).build())
                .isInstanceOf(ValidonceDefinitionException.class).hasMessageContaining("not supported");
        assertThatThrownBy(() -> b().compareValue("naive", Op.GE, "2026-01-01T00:00:00").build())
                .isInstanceOf(ValidonceDefinitionException.class).hasMessageContaining("UTC offset");
        assertThatThrownBy(() -> b().compare("end", Op.GE, "quantity").build())
                .isInstanceOf(ValidonceDefinitionException.class).hasMessageContaining("cannot compare");
    }

    @Test
    void idCollisionFails() {
        assertThatThrownBy(() -> b().compare("end", Op.GE, "start_date").compare("end", Op.LE, "start_date").build())
                .isInstanceOf(ValidonceDefinitionException.class).hasMessageContaining("duplicate rule id");
        // An explicit id resolves it.
        assertThat(b().compare("end", Op.GE, "start_date").compare("end", Op.LE, "start_date").id("Signup.compare.end2")
                .build().rules()).hasSize(2);
    }

    @Test
    void groupNeedsTwoDistinctFields() {
        assertThatThrownBy(() -> b().atLeastOneOf("plan").build()).isInstanceOf(ValidonceDefinitionException.class);
        assertThatThrownBy(() -> b().allOrNone("plan", "plan").build()).isInstanceOf(ValidonceDefinitionException.class);
    }

    @Test
    void evaluatesBeans() {
        ObjectMapper m = new ObjectMapper().findAndRegisterModules()
                .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        RuleSet rules = RuleSetBuilder.forType(Signup.class, m)
                .requiredWhen("company", Condition.eq("plan", "pro")).build();
        JsonNode data = m.valueToTree(new Signup("pro", null, null, null, 0, false, null));
        assertThat(rules.evaluate(data)).hasSize(1);
    }
}
