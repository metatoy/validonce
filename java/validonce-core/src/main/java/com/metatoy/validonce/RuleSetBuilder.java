// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import com.fasterxml.jackson.databind.BeanDescription;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.introspect.BeanPropertyDefinition;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Fluent builder for the rules of one type. Fields are Jackson property names (the wire names).
 * {@link #build()} checks everything and throws {@link ValidonceDefinitionException} on an unknown
 * field, an unsupported compare type or an id collision.
 *
 * <pre>{@code
 * RuleSet rules = RuleSetBuilder.forType(Signup.class)
 *     .requiredWhen("company", Condition.eq("plan", "pro")).key("rules.company_required")
 *     .compare("end", Op.GE, "start").key("rules.end_after_start")
 *     .compareValue("quantity", Op.GE, 1).key("rules.quantity_min").param("min", 1)
 *     .build();
 * }</pre>
 *
 * Each rule method starts a rule; the option methods ({@link #key}, {@link #param}, {@link #id},
 * {@link #path}, {@link #serverOnly}, {@link #type}) apply to the rule started last.
 */
public final class RuleSetBuilder<T> {
    private final Class<T> type;
    private final Map<String, JavaType> properties = new LinkedHashMap<>();
    private final List<Pending> pending = new ArrayList<>();

    private static final class Pending {
        final String kind;
        final List<String> fields; // required_when: [field]; compare: [left, rightField?]; groups: fields
        Condition when;
        Op op;
        Object constant;
        boolean hasConstant;
        CompareType type;
        String id;
        String path;
        String key;
        boolean serverOnly;
        final Map<String, Object> params = new LinkedHashMap<>();

        Pending(String kind, List<String> fields) {
            this.kind = kind;
            this.fields = fields;
        }
    }

    private RuleSetBuilder(Class<T> type, ObjectMapper mapper) {
        this.type = type;
        BeanDescription bd = mapper.getSerializationConfig().introspect(mapper.constructType(type));
        for (BeanPropertyDefinition p : bd.findProperties()) {
            properties.put(p.getName(), p.getPrimaryType());
        }
    }

    public static <T> RuleSetBuilder<T> forType(Class<T> type) {
        return new RuleSetBuilder<>(type, new ObjectMapper());
    }

    /** Use the application's mapper so naming strategies and annotations mixins apply. */
    public static <T> RuleSetBuilder<T> forType(Class<T> type, ObjectMapper mapper) {
        return new RuleSetBuilder<>(type, mapper);
    }

    // ---- rules ----

    public RuleSetBuilder<T> requiredWhen(String field, Condition when) {
        Pending p = new Pending("required_when", List.of(field));
        p.when = when;
        pending.add(p);
        return this;
    }

    /** {@code left op right}, where right is another field. */
    public RuleSetBuilder<T> compare(String left, Op op, String rightField) {
        Pending p = new Pending("compare", List.of(left, rightField));
        p.op = op;
        pending.add(p);
        return this;
    }

    /** {@code left op value}, where value is a number or a string. */
    public RuleSetBuilder<T> compareValue(String left, Op op, Object value) {
        Pending p = new Pending("compare", List.of(left));
        p.op = op;
        p.constant = value;
        p.hasConstant = true;
        pending.add(p);
        return this;
    }

    public RuleSetBuilder<T> atLeastOneOf(String... fields) {
        pending.add(new Pending("at_least_one_of", List.of(fields)));
        return this;
    }

    public RuleSetBuilder<T> exactlyOneOf(String... fields) {
        pending.add(new Pending("exactly_one_of", List.of(fields)));
        return this;
    }

    public RuleSetBuilder<T> allOrNone(String... fields) {
        pending.add(new Pending("all_or_none", List.of(fields)));
        return this;
    }

    // ---- options for the rule started last ----

    /** The message key. Without one the key is {@code rules.<kind>.<field>}. */
    public RuleSetBuilder<T> key(String key) {
        last().key = key;
        return this;
    }

    public RuleSetBuilder<T> param(String name, Object value) {
        last().params.put(name, value);
        return this;
    }

    /** The rule id. Without one it is {@code TypeName.kind.field}. */
    public RuleSetBuilder<T> id(String id) {
        last().id = id;
        return this;
    }

    /** Report the issue on this field instead of the kind's default. */
    public RuleSetBuilder<T> path(String field) {
        last().path = field;
        return this;
    }

    /** Clients skip this rule; the server always runs it. */
    public RuleSetBuilder<T> serverOnly() {
        last().serverOnly = true;
        return this;
    }

    /** The compare type, for a String field that carries dates or numbers. Inferred otherwise. */
    public RuleSetBuilder<T> type(CompareType type) {
        last().type = type;
        return this;
    }

    private Pending last() {
        if (pending.isEmpty()) throw new ValidonceDefinitionException("start a rule before setting its options");
        return pending.get(pending.size() - 1);
    }

    // ---- build ----

    public RuleSet build() {
        String model = type.getSimpleName();
        List<Rule> rules = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (Pending p : pending) {
            for (String f : p.fields) known(f);
            if (p.path != null) known(p.path);
            String first = p.fields.get(0);
            String id = p.id != null ? p.id : model + "." + p.kind + "." + first;
            if (!ids.add(id)) {
                throw new ValidonceDefinitionException(model + ": duplicate rule id '" + id
                        + "'. Give one of the rules a unique id with .id(...).");
            }
            Message message = new Message(p.key != null ? p.key : "rules." + p.kind + "." + first, p.params);
            switch (p.kind) {
                case "required_when" -> {
                    checkCondition(p.when);
                    rules.add(new Rule.RequiredWhen(id, p.path, p.serverOnly, message, first, p.when));
                }
                case "compare" -> rules.add(compare(p, id, message));
                default -> {
                    if (p.fields.size() < 2) {
                        throw new ValidonceDefinitionException(model + ": " + p.kind + " needs at least 2 fields");
                    }
                    if (new HashSet<>(p.fields).size() != p.fields.size()) {
                        throw new ValidonceDefinitionException(model + ": " + p.kind + " fields must be distinct");
                    }
                    rules.add(new Rule.Group(p.kind, id, p.path, p.serverOnly, message, p.fields));
                }
            }
        }
        return new RuleSet(rules);
    }

    private Rule compare(Pending p, String id, Message message) {
        String left = p.fields.get(0);
        CompareType t = p.type != null ? p.type : infer(left);
        Rule.Operand right;
        if (p.hasConstant) {
            Object v = p.constant;
            if (t == CompareType.NUMBER && !(v instanceof Number)) {
                throw new ValidonceDefinitionException(type.getSimpleName() + ": '" + left
                        + "' is compared as a number, but the value is " + v);
            }
            if (t != CompareType.NUMBER && !(v instanceof String)) {
                throw new ValidonceDefinitionException(type.getSimpleName() + ": '" + left
                        + "' is compared as " + t.wire() + ", so the value must be a string");
            }
            right = Rule.Operand.value(Json.constant(v));
        } else {
            String rf = p.fields.get(1);
            CompareType rt = p.type != null ? p.type : infer(rf);
            if (rt != t) {
                throw new ValidonceDefinitionException(type.getSimpleName() + ": cannot compare '" + left + "' ("
                        + t.wire() + ") with '" + rf + "' (" + rt.wire() + ")");
            }
            right = Rule.Operand.field(rf);
        }
        return new Rule.Compare(id, p.path, p.serverOnly, message, left, p.op, right, t);
    }

    private void known(String field) {
        if (!properties.containsKey(field)) {
            throw new ValidonceDefinitionException(type.getSimpleName() + " has no JSON property '" + field
                    + "'. Known properties: " + properties.keySet());
        }
    }

    private void checkCondition(Condition c) {
        if (c instanceof Condition.Eq e) known(e.field());
        else if (c instanceof Condition.Ne e) known(e.field());
        else if (c instanceof Condition.In e) known(e.field());
        else if (c instanceof Condition.Present e) known(e.field());
        else if (c instanceof Condition.Absent e) known(e.field());
        else if (c instanceof Condition.All a) a.conditions().forEach(this::checkCondition);
        else if (c instanceof Condition.Any a) a.conditions().forEach(this::checkCondition);
        else if (c instanceof Condition.Not n) checkCondition(n.condition());
        else throw new ValidonceDefinitionException("a required_when rule needs a condition");
    }

    private CompareType infer(String field) {
        known(field);
        Class<?> c = properties.get(field).getRawClass();
        if (c.isPrimitive()) {
            if (c == boolean.class || c == char.class) throw unsupported(field, c);
            return CompareType.NUMBER;
        }
        if (Number.class.isAssignableFrom(c)) return CompareType.NUMBER;
        if (c == String.class) return CompareType.STRING;
        if (c == LocalDate.class) return CompareType.DATE;
        if (c == OffsetDateTime.class || c == ZonedDateTime.class || c == Instant.class) return CompareType.DATETIME;
        if (c == LocalDateTime.class) {
            throw new ValidonceDefinitionException(type.getSimpleName() + "." + field
                    + ": LocalDateTime carries no UTC offset, so it cannot be compared. "
                    + "Use OffsetDateTime or Instant for an instant, or LocalDate for a calendar date.");
        }
        throw unsupported(field, c);
    }

    private ValidonceDefinitionException unsupported(String field, Class<?> c) {
        return new ValidonceDefinitionException(type.getSimpleName() + "." + field + ": " + c.getSimpleName()
                + " is not supported in a compare rule (use a number, String, LocalDate, OffsetDateTime, "
                + "ZonedDateTime or Instant, or set .type(...) for a String)");
    }
}
