// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import com.fasterxml.jackson.annotation.JsonValue;

public enum Plan {
    FREE("free"), PRO("pro");

    private final String wire;

    Plan(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }
}
