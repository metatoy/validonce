// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

/** Which side evaluates: the server runs every rule, a client skips {@code server_only} rules. */
public enum Side {
    SERVER, CLIENT
}
