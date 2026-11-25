// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import com.metatoy.validonce.spring.ValidonceRules;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

/** The playground Contact contract. Field rules here; the cross-field rules are in {@link ContactRules}. */
@ValidonceRules(ContactRules.class)
public record Contact(
        @Schema(nullable = true) @Email String email,
        @Schema(nullable = true) @Pattern(regexp = "^\\+?[0-9 ()-]{7,20}$") String phone,
        @Schema(nullable = true) String street,
        @Schema(nullable = true) String city,
        @Schema(nullable = true) String postalCode,
        @NotNull @Pattern(regexp = "US|CA|GB|other") String country,
        @Schema(nullable = true) LocalDate availableFrom,
        @Schema(nullable = true) LocalDate availableTo) {}
