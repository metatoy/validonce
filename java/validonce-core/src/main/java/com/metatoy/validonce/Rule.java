// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import java.util.List;

/** One rule of rule format v1. Immutable. */
public sealed interface Rule {
    String id();

    /** The explicit path, or null for the kind's default. */
    String path();

    boolean serverOnly();

    Message message();

    /** The kind name used in rule-format data. */
    String kind();

    /** The field the issue is reported on when {@link #path()} is null. */
    String defaultPath();

    /** Right side of a {@code compare}: a field, or a constant (String or Double). */
    record Operand(String field, Object value) {
        public static Operand field(String field) {
            return new Operand(field, null);
        }

        public static Operand value(Object value) {
            return new Operand(null, value);
        }

        public boolean isField() {
            return field != null;
        }
    }

    record RequiredWhen(String id, String path, boolean serverOnly, Message message, String field, Condition when)
            implements Rule {
        public String kind() {
            return "required_when";
        }

        public String defaultPath() {
            return field;
        }
    }

    record Compare(String id, String path, boolean serverOnly, Message message, String left, Op op, Operand right,
            CompareType type) implements Rule {
        public String kind() {
            return "compare";
        }

        public String defaultPath() {
            return left;
        }
    }

    /** {@code at_least_one_of}, {@code exactly_one_of} or {@code all_or_none}. */
    record Group(String kind, String id, String path, boolean serverOnly, Message message, List<String> fields)
            implements Rule {
        public Group {
            fields = List.copyOf(fields);
        }

        public String defaultPath() {
            return fields.get(0);
        }
    }
}
