// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

/** The type check a {@code compare} rule applies to both sides. */
public enum CompareType {
    NUMBER("number"), STRING("string"), DATE("date"), DATETIME("datetime");

    private final String wire;

    CompareType(String wire) {
        this.wire = wire;
    }

    /** The name used in rule-format data. */
    public String wire() {
        return wire;
    }

    static CompareType fromWire(String s) {
        for (CompareType t : values()) {
            if (t.wire.equals(s)) return t;
        }
        throw new ValidonceFormatException("unknown compare type: " + s);
    }
}
