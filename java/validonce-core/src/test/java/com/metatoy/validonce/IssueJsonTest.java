// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class IssueJsonTest {
    @Test
    void wireNamesSurviveSnakeCase() {
        ObjectMapper m = new ObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        JsonNode n = m.valueToTree(new Issue(List.of("end"), "Signup.compare.end", "rules.k", Map.of("min", 1)));
        assertThat(n.fieldNames()).toIterable().containsExactlyInAnyOrder("path", "ruleId", "key", "params");
        assertThat(n.get("ruleId").asText()).isEqualTo("Signup.compare.end");
    }
}
