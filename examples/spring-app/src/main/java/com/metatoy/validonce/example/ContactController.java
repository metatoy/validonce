// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Stateless: stores nothing and never logs the body. {@link BodyLimitFilter} caps it at 16 KB. */
@RestController
public class ContactController {
    @PostMapping("/contacts")
    public Map<String, Boolean> create(@Valid @RequestBody Contact body) {
        return Map.of("ok", true);
    }

    @GetMapping("/healthz")
    public Map<String, Boolean> health() {
        return Map.of("ok", true);
    }
}
