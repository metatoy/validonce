// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import java.util.LinkedHashMap;
import java.util.Map;

/** A rule's message: a translation key and optional parameters (strings, numbers, booleans, null). */
public record Message(String key, Map<String, Object> params) {
    public Message {
        params = params == null ? Map.of() : java.util.Collections.unmodifiableMap(new LinkedHashMap<>(params));
    }

    public Message(String key) {
        this(key, Map.of());
    }
}
