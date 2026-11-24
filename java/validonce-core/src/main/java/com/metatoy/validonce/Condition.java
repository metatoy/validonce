// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import java.util.List;

/** A condition of a {@code required_when} rule. Scalars are String, Boolean or Double. */
public sealed interface Condition {
    record Eq(String field, Object value) implements Condition {}

    record Ne(String field, Object value) implements Condition {}

    record In(String field, List<Object> values) implements Condition {
        public In {
            values = List.copyOf(values);
        }
    }

    record Present(String field) implements Condition {}

    record Absent(String field) implements Condition {}

    record All(List<Condition> conditions) implements Condition {
        public All {
            conditions = List.copyOf(conditions);
        }
    }

    record Any(List<Condition> conditions) implements Condition {
        public Any {
            conditions = List.copyOf(conditions);
        }
    }

    record Not(Condition condition) implements Condition {}

    static Condition eq(String field, Object value) {
        return new Eq(field, Json.scalar(value));
    }

    static Condition ne(String field, Object value) {
        return new Ne(field, Json.scalar(value));
    }

    static Condition in(String field, Object... values) {
        return new In(field, java.util.Arrays.stream(values).map(Json::scalar).toList());
    }

    static Condition present(String field) {
        return new Present(field);
    }

    static Condition absent(String field) {
        return new Absent(field);
    }

    static Condition all(Condition... conditions) {
        return new All(List.of(conditions));
    }

    static Condition any(Condition... conditions) {
        return new Any(List.of(conditions));
    }

    static Condition not(Condition condition) {
        return new Not(condition);
    }
}
