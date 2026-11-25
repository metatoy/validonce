// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@AutoConfigureMockMvc
class ContactApiTest {
    @Autowired
    MockMvc mvc;

    private ResultActions send(String json) throws Exception {
        return mvc.perform(post("/contacts").contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private void issue(String json, String ruleId, String key, String path) throws Exception {
        send(json).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.validonce[?(@.ruleId=='" + ruleId + "')].key").value(key))
                .andExpect(jsonPath("$.validonce[?(@.ruleId=='" + ruleId + "')].path[0]").value(path));
    }

    @Test
    void validContactIsAccepted() throws Exception {
        send("""
                {"email":"a@example.test","country":"US","street":"1 Main","city":"X","postalCode":"55555",
                 "availableFrom":"2026-12-01","availableTo":"2026-12-02"}
                """).andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
    }

    @Test
    void emailOrPhone() throws Exception {
        issue("{\"country\":\"CA\"}", "Contact.at_least_one_of.email", "rules.contact_email_or_phone", "email");
    }

    @Test
    void addressAllOrNone() throws Exception {
        issue("{\"email\":\"a@example.test\",\"country\":\"CA\",\"street\":\"1 Main\"}",
                "Contact.all_or_none.street", "rules.address_all_or_none", "street");
    }

    @Test
    void postalCodeRequiredInUs() throws Exception {
        issue("{\"email\":\"a@example.test\",\"country\":\"US\"}",
                "Contact.required_when.postalCode", "rules.postal_code_required_us", "postalCode");
    }

    @Test
    void availableToNotBeforeFrom() throws Exception {
        issue("{\"email\":\"a@example.test\",\"country\":\"CA\",\"availableFrom\":\"2026-12-05\","
                        + "\"availableTo\":\"2026-12-01\"}",
                "Contact.compare.availableTo", "rules.available_to_after_from", "availableTo");
    }

    @Test
    void oversizedBodyIsRejected() throws Exception {
        send("{\"email\":\"a@example.test\",\"country\":\"CA\",\"city\":\"" + "x".repeat(20000) + "\"}")
                .andExpect(status().isPayloadTooLarge());
    }

    @Test
    void chunkedBodyOverTheCapIsRejected() throws Exception {
        String body = "{\"email\":\"a@example.test\",\"country\":\"CA\",\"city\":\"" + "x".repeat(20000) + "\"}";
        mvc.perform(post("/contacts").contentType(MediaType.APPLICATION_JSON).content(body)
                        .with(request -> {
                            request.addHeader("Content-Length", "-1"); // no declared length, as with chunked transfer
                            return request;
                        }))
                .andExpect(status().isPayloadTooLarge());
    }
}
