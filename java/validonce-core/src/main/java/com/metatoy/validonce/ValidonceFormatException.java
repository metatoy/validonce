// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

/** Rule data is not a valid version 1 rule set. */
public class ValidonceFormatException extends IllegalArgumentException {
    public ValidonceFormatException(String message) {
        super(message);
    }
}
