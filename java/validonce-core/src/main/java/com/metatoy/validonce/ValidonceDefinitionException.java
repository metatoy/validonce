// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

/**
 * A rule definition is wrong: unknown field, unsupported compare type, id collision. Thrown while the
 * rules are built, which the Spring integration does at startup.
 */
public class ValidonceDefinitionException extends IllegalStateException {
    public ValidonceDefinitionException(String message) {
        super(message);
    }
}
