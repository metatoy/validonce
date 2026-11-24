// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

/** Comparison operator of a {@code compare} rule. */
public enum Op {
    LT("lt"), LE("le"), GT("gt"), GE("ge"), EQ("eq"), NE("ne");

    private final String wire;

    Op(String wire) {
        this.wire = wire;
    }

    /** The name used in rule-format data. */
    public String wire() {
        return wire;
    }

    static Op fromWire(String s) {
        for (Op o : values()) {
            if (o.wire.equals(s)) return o;
        }
        throw new ValidonceFormatException("unknown op: " + s);
    }
}
