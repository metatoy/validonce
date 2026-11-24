// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import com.metatoy.validonce.spring.ValidonceRules;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** The shared Signup contract. Field rules here; the cross-field rules are in {@link SignupRules}. */
@ValidonceRules(SignupRules.class)
public record Signup(
        @NotNull Plan plan,
        @Schema(nullable = true) String company,
        @NotNull @Size(min = 1) String email,
        @NotNull LocalDate start,
        @Schema(nullable = true) LocalDate end,
        @NotNull Integer quantity) {}
