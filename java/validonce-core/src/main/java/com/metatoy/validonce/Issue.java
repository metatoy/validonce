// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import java.util.List;
import java.util.Map;

/**
 * One failing rule, in the shape every implementation uses: {@code path}, {@code ruleId}, {@code key},
 * {@code params}. Serializes with Jackson as exactly that object.
 */
public record Issue(List<String> path, String ruleId, String key, Map<String, Object> params) {
    public Issue {
        path = List.copyOf(path);
        params = params == null ? Map.of() : java.util.Collections.unmodifiableMap(params);
    }

    /** The same issue under a different path (the host adds prefixes for nested objects). */
    public Issue withPath(List<String> newPath) {
        return new Issue(newPath, ruleId, key, params);
    }
}
