// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

/**
 * One failing rule, in the shape every implementation uses: {@code path}, {@code ruleId}, {@code key},
 * {@code params}. Serializes with Jackson as exactly that object; the names are pinned, so a naming
 * strategy (such as SNAKE_CASE) on the application's mapper does not rename them.
 */
public record Issue(
        @JsonProperty("path") List<String> path,
        @JsonProperty("ruleId") String ruleId,
        @JsonProperty("key") String key,
        @JsonProperty("params") Map<String, Object> params) {
    public Issue {
        path = List.copyOf(path);
        params = params == null ? Map.of() : java.util.Collections.unmodifiableMap(params);
    }

    /** The same issue under a different path (the host adds prefixes for nested objects). */
    public Issue withPath(List<String> newPath) {
        return new Issue(newPath, ruleId, key, params);
    }
}
