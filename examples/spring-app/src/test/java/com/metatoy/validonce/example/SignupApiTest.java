// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class SignupApiTest {
    @Autowired
    MockMvc mvc;

    private org.springframework.test.web.servlet.ResultActions send(String json) throws Exception {
        return mvc.perform(post("/signups").contentType(MediaType.APPLICATION_JSON).content(json));
    }

    @Test
    void validSignupIsAccepted() throws Exception {
        send("""
                {"plan":"free","company":null,"email":"a@example.test","start":"2026-12-01","end":null,"quantity":1}
                """).andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
    }

    @Test
    void brokenRulesAreReportedTogetherAs422ProblemDetails() throws Exception {
        send("""
                {"plan":"pro","company":null,"email":"a@example.test","start":"2026-12-05","end":"2026-12-01","quantity":0}
                """)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(422))
                .andExpect(jsonPath("$.validonce.length()").value(3))
                .andExpect(jsonPath("$.validonce[0].path[0]").value("company"))
                .andExpect(jsonPath("$.validonce[0].ruleId").value("Signup.required_when.company"))
                .andExpect(jsonPath("$.validonce[0].key").value("rules.company_required"))
                .andExpect(jsonPath("$.validonce[1].ruleId").value("Signup.compare.end"))
                .andExpect(jsonPath("$.validonce[2].params.min").value(1));
    }

    @Test
    void fieldErrorsAreListedBesideTheRules() throws Exception {
        send("""
                {"plan":"free","email":"","start":"2026-12-01","quantity":1}
                """)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors.email").isArray())
                .andExpect(jsonPath("$.validonce.length()").value(0));
    }
}
