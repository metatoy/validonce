// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring.nested;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** The application's mapper uses SNAKE_CASE, and one property has an explicit name. */
@SpringBootTest(classes = NestedApp.class, properties = "spring.jackson.property-naming-strategy=SNAKE_CASE")
@AutoConfigureMockMvc
class NestedPathsTest {
    @Autowired
    MockMvc mvc;

    @Test
    void issuePathsUseWireNamesAtEveryLevel() throws Exception {
        String body = mvc.perform(post("/orders").contentType(MediaType.APPLICATION_JSON).content("""
                {"start_date":"2026-12-05","end_date":"2026-12-01",
                 "billing_address":{"kind":"biz","company":null},
                 "ship_to":[{"kind":"home"},{"kind":"biz"}],
                 "by_region":{"eu":{"kind":"biz"}}}
                """))
                .andExpect(status().isUnprocessableEntity())
                .andReturn().getResponse().getContentAsString();
        JsonNode issues = new ObjectMapper().readTree(body).get("validonce");
        // The issue fields keep their names under SNAKE_CASE; the paths are wire names with indexes and keys.
        Set<String> paths = new HashSet<>();
        for (JsonNode i : issues) {
            assertThat(i.fieldNames()).toIterable().containsExactlyInAnyOrder("path", "ruleId", "key", "params");
            paths.add(i.get("path").toString());
        }
        assertThat(paths).containsExactlyInAnyOrder("[\"end_date\"]", "[\"billing_address\",\"company\"]",
                "[\"ship_to\",\"1\",\"company\"]", "[\"by_region\",\"eu\",\"company\"]");
    }

    @Test
    void nestedTypesGetXValidonceInOpenApi() throws Exception {
        mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.schemas.Order['x-validonce'].rules.length()").value(1))
                .andExpect(jsonPath("$.components.schemas.Address['x-validonce'].rules[0].id")
                        .value("Address.required_when.company"));
    }
}
