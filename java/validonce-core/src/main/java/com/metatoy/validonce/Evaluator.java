// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Evaluates rule format v1 against the JSON value of an object, as docs/rule-format-v1.md pins it:
 * blank = missing, null, "" or []; no coercion; strict equality; numbers as doubles; strings by code
 * point; dates and datetimes as real calendar values.
 */
public final class Evaluator {
    private Evaluator() {}

    public static List<Issue> evaluate(List<Rule> rules, JsonNode data, Side side) {
        List<Issue> issues = new ArrayList<>();
        for (Rule rule : rules) {
            if (side == Side.CLIENT && rule.serverOnly()) continue;
            if (fails(rule, data)) {
                issues.add(new Issue(
                        List.of(rule.path() != null ? rule.path() : rule.defaultPath()),
                        rule.id(),
                        rule.message().key(),
                        new java.util.LinkedHashMap<>(rule.message().params())));
            }
        }
        return issues;
    }

    private static boolean fails(Rule rule, JsonNode data) {
        if (rule instanceof Rule.RequiredWhen r) {
            return cond(r.when(), data) && blank(get(data, r.field()));
        }
        if (rule instanceof Rule.Compare c) return compareFails(c, data);
        Rule.Group g = (Rule.Group) rule;
        long given = g.fields().stream().filter(f -> !blank(get(data, f))).count();
        return switch (g.kind()) {
            case "at_least_one_of" -> given == 0;
            case "exactly_one_of" -> given != 1;
            default -> given > 0 && given < g.fields().size();
        };
    }

    private static JsonNode get(JsonNode data, String field) {
        return data == null ? null : data.get(field);
    }

    static boolean blank(JsonNode v) {
        return v == null || v.isNull() || v.isMissingNode() || (v.isTextual() && v.textValue().isEmpty())
                || (v.isArray() && v.isEmpty());
    }

    private static boolean strictEq(JsonNode a, Object b) {
        if (a == null) return false;
        if (b instanceof String s) return a.isTextual() && a.textValue().equals(s);
        if (b instanceof Boolean x) return a.isBoolean() && a.booleanValue() == x;
        if (b instanceof Double d) return a.isNumber() && a.doubleValue() == d;
        return false;
    }

    private static boolean cond(Condition c, JsonNode data) {
        if (c instanceof Condition.Eq e) return strictEq(get(data, e.field()), e.value());
        if (c instanceof Condition.Ne e) return !strictEq(get(data, e.field()), e.value());
        if (c instanceof Condition.In e) {
            JsonNode v = get(data, e.field());
            return e.values().stream().anyMatch(x -> strictEq(v, x));
        }
        if (c instanceof Condition.Present p) return !blank(get(data, p.field()));
        if (c instanceof Condition.Absent p) return blank(get(data, p.field()));
        if (c instanceof Condition.All a) return a.conditions().stream().allMatch(x -> cond(x, data));
        if (c instanceof Condition.Any a) return a.conditions().stream().anyMatch(x -> cond(x, data));
        return !cond(((Condition.Not) c).condition(), data);
    }

    // ---- compare ----

    private static boolean compareFails(Rule.Compare r, JsonNode data) {
        JsonNode l = get(data, r.left());
        JsonNode rt = r.right().isField() ? get(data, r.right().field()) : Json.toNode(r.right().value());
        if (blank(l) || blank(rt)) return false;
        Object a = typed(r.type(), l);
        Object b = typed(r.type(), rt);
        if (a == null || b == null) return false;
        int c;
        if (a instanceof String x && b instanceof String y) {
            c = cmpCodePoints(x, y);
        } else {
            double p = (Double) a;
            double q = (Double) b;
            c = p < q ? -1 : p > q ? 1 : 0;
        }
        return switch (r.op()) {
            case LT -> !(c < 0);
            case LE -> !(c <= 0);
            case GT -> !(c > 0);
            case GE -> !(c >= 0);
            case EQ -> c != 0;
            case NE -> c == 0;
        };
    }

    private static int cmpCodePoints(String a, String b) {
        int i = 0;
        int j = 0;
        while (i < a.length() && j < b.length()) {
            int p = a.codePointAt(i);
            int q = b.codePointAt(j);
            if (p != q) return p < q ? -1 : 1;
            i += Character.charCount(p);
            j += Character.charCount(q);
        }
        boolean aDone = i >= a.length();
        boolean bDone = j >= b.length();
        return aDone && bDone ? 0 : aDone ? -1 : 1;
    }

    /** A String (string type) or Double sort key, or null when the type check fails. */
    private static Object typed(CompareType type, JsonNode v) {
        switch (type) {
            case NUMBER: {
                if (!v.isNumber()) return null;
                double d = v.doubleValue();
                return Double.isFinite(d) ? (Object) d : null;
            }
            case STRING:
                return v.isTextual() ? v.textValue() : null;
            case DATE:
                return parseDate(v);
            default:
                return parseDateTime(v);
        }
    }

    private static final Pattern DATE = Pattern.compile("([0-9]{4})-([0-9]{2})-([0-9]{2})");
    private static final Pattern DATETIME = Pattern.compile(
            "([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\\.([0-9]+))?(Z|[+-][0-9]{2}:[0-9]{2})");

    private static boolean validDate(int y, int m, int d) {
        if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
        return d <= java.time.YearMonth.of(y, m).lengthOfMonth();
    }

    private static Double parseDate(JsonNode v) {
        if (!v.isTextual()) return null;
        Matcher m = DATE.matcher(v.textValue());
        if (!m.matches()) return null;
        int y = Integer.parseInt(m.group(1));
        int mo = Integer.parseInt(m.group(2));
        int d = Integer.parseInt(m.group(3));
        return validDate(y, mo, d) ? (double) (y * 10000 + mo * 100 + d) : null;
    }

    private static Double parseDateTime(JsonNode v) {
        if (!v.isTextual()) return null;
        Matcher m = DATETIME.matcher(v.textValue());
        if (!m.matches()) return null;
        int y = Integer.parseInt(m.group(1));
        int mo = Integer.parseInt(m.group(2));
        int d = Integer.parseInt(m.group(3));
        int h = Integer.parseInt(m.group(4));
        int mi = Integer.parseInt(m.group(5));
        int s = Integer.parseInt(m.group(6));
        if (!validDate(y, mo, d) || h > 23 || mi > 59 || s > 59) return null;
        String frac = m.group(7) == null ? "" : m.group(7);
        int ms = Integer.parseInt((frac + "000").substring(0, 3));
        long offset = 0;
        String z = m.group(8);
        if (!z.equals("Z")) {
            int oh = Integer.parseInt(z.substring(1, 3));
            int om = Integer.parseInt(z.substring(4, 6));
            if (oh > 23 || om > 59) return null;
            offset = (z.charAt(0) == '-' ? -1L : 1L) * (oh * 60L + om) * 60000L;
        }
        long day = java.time.LocalDate.of(y, mo, d).toEpochDay();
        return (double) (day * 86_400_000L + ((h * 60L + mi) * 60L + s) * 1000L + ms - offset);
    }
}
