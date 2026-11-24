// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Reading and writing rule-format data. */
final class Json {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final JsonNodeFactory F = JsonNodeFactory.instance;

    private Json() {}

    /** Normalizes a scalar to String, Boolean or Double (numbers are IEEE doubles in the format). */
    static Object scalar(Object v) {
        if (v instanceof String || v instanceof Boolean) return v;
        if (v instanceof Number n) return n.doubleValue();
        throw new ValidonceDefinitionException("a value must be a string, number or boolean, not " + v);
    }

    /** A compare constant: a String or a number, never a boolean. */
    static Object constant(Object v) {
        if (v instanceof String) return v;
        if (v instanceof Number n) return n.doubleValue();
        throw new ValidonceDefinitionException("a compare value must be a string or a number, not " + v);
    }

    static JsonNode toNode(Object v) {
        if (v instanceof String s) return F.textNode(s);
        if (v instanceof Boolean b) return F.booleanNode(b);
        return F.numberNode(((Number) v).doubleValue());
    }

    private static JsonNode out(Object v) {
        if (v instanceof Double d && d == Math.rint(d) && Math.abs(d) < 9.007199254740992E15) {
            return F.numberNode(d.longValue());
        }
        return MAPPER.valueToTree(v);
    }

    // ---- writing ----

    static ObjectNode write(List<Rule> rules) {
        ObjectNode root = F.objectNode();
        root.put("version", 1);
        ArrayNode arr = root.putArray("rules");
        for (Rule r : rules) arr.add(write(r));
        return root;
    }

    private static ObjectNode write(Rule r) {
        ObjectNode o = F.objectNode();
        o.put("id", r.id());
        o.put("kind", r.kind());
        if (r.path() != null) o.put("path", r.path());
        if (r instanceof Rule.RequiredWhen rw) {
            o.put("field", rw.field());
            o.set("when", write(rw.when()));
        } else if (r instanceof Rule.Compare c) {
            o.putObject("left").put("field", c.left());
            o.put("op", c.op().wire());
            ObjectNode right = o.putObject("right");
            if (c.right().isField()) right.put("field", c.right().field());
            else right.set("value", out(c.right().value()));
            o.put("type", c.type().wire());
        } else if (r instanceof Rule.Group g) {
            ArrayNode fs = o.putArray("fields");
            g.fields().forEach(fs::add);
        }
        ObjectNode m = o.putObject("message");
        m.put("key", r.message().key());
        if (!r.message().params().isEmpty()) m.set("params", MAPPER.valueToTree(r.message().params()));
        if (r.serverOnly()) o.put("server_only", true);
        return o;
    }

    private static ObjectNode write(Condition c) {
        ObjectNode o = F.objectNode();
        if (c instanceof Condition.Eq e) {
            fv(o.putObject("eq"), e.field(), e.value());
        } else if (c instanceof Condition.Ne e) {
            fv(o.putObject("ne"), e.field(), e.value());
        } else if (c instanceof Condition.In e) {
            ObjectNode b = o.putObject("in");
            b.put("field", e.field());
            ArrayNode vs = b.putArray("values");
            e.values().forEach(v -> vs.add(out(v)));
        } else if (c instanceof Condition.Present p) {
            o.putObject("present").put("field", p.field());
        } else if (c instanceof Condition.Absent p) {
            o.putObject("absent").put("field", p.field());
        } else if (c instanceof Condition.All a) {
            ArrayNode arr = o.putArray("all");
            a.conditions().forEach(x -> arr.add(write(x)));
        } else if (c instanceof Condition.Any a) {
            ArrayNode arr = o.putArray("any");
            a.conditions().forEach(x -> arr.add(write(x)));
        } else if (c instanceof Condition.Not n) {
            o.set("not", write(n.condition()));
        }
        return o;
    }

    private static void fv(ObjectNode b, String field, Object value) {
        b.put("field", field);
        b.set("value", out(value));
    }

    // ---- reading ----

    static List<Rule> read(JsonNode root) {
        if (root == null || !root.isObject()) throw new ValidonceFormatException("x-validonce must be an object");
        JsonNode version = root.get("version");
        if (version == null || !version.isInt() || version.intValue() != 1) {
            throw new ValidonceFormatException("unsupported version: " + version);
        }
        JsonNode rules = root.get("rules");
        if (rules == null || !rules.isArray()) throw new ValidonceFormatException("rules must be an array");
        List<Rule> out = new ArrayList<>();
        for (JsonNode r : rules) out.add(readRule(r));
        return out;
    }

    private static Rule readRule(JsonNode r) {
        if (!r.isObject()) throw new ValidonceFormatException("rule must be an object");
        String kind = text(r, "kind");
        String id = text(r, "id");
        JsonNode msg = r.get("message");
        if (id == null || msg == null || text(msg, "key") == null) {
            throw new ValidonceFormatException("rule needs id and message.key");
        }
        Map<String, Object> params = msg.has("params")
                ? MAPPER.convertValue(msg.get("params"), new TypeReference<LinkedHashMap<String, Object>>() {})
                : Map.of();
        Message message = new Message(text(msg, "key"), params);
        String path = text(r, "path");
        boolean serverOnly = r.path("server_only").asBoolean(false);
        if (kind == null) throw new ValidonceFormatException("rule " + id + " needs kind");
        switch (kind) {
            case "required_when": {
                String field = text(r, "field");
                if (field == null || !r.has("when")) {
                    throw new ValidonceFormatException("required_when rule " + id + " needs field and when");
                }
                return new Rule.RequiredWhen(id, path, serverOnly, message, field, readCondition(r.get("when"), id));
            }
            case "compare": {
                String left = text(r.path("left"), "field");
                if (left == null) throw new ValidonceFormatException("compare rule " + id + " needs left.field");
                JsonNode right = r.path("right");
                Rule.Operand operand;
                if (text(right, "field") != null) {
                    operand = Rule.Operand.field(text(right, "field"));
                } else if (right.has("value") && (right.get("value").isTextual() || right.get("value").isNumber())) {
                    operand = Rule.Operand.value(scalarOf(right.get("value")));
                } else {
                    throw new ValidonceFormatException("compare rule " + id + " needs right.field or right.value");
                }
                return new Rule.Compare(id, path, serverOnly, message, left, Op.fromWire(text(r, "op")), operand,
                        CompareType.fromWire(text(r, "type")));
            }
            case "at_least_one_of":
            case "exactly_one_of":
            case "all_or_none": {
                JsonNode fs = r.get("fields");
                if (fs == null || !fs.isArray() || fs.size() < 2) {
                    throw new ValidonceFormatException(kind + " rule " + id + " needs 2 or more fields");
                }
                List<String> fields = new ArrayList<>();
                for (JsonNode f : fs) {
                    if (!f.isTextual() || f.asText().isEmpty()) {
                        throw new ValidonceFormatException(kind + " rule " + id + ": fields must be names");
                    }
                    fields.add(f.asText());
                }
                return new Rule.Group(kind, id, path, serverOnly, message, fields);
            }
            default:
                throw new ValidonceFormatException("unknown rule kind: " + kind);
        }
    }

    private static Condition readCondition(JsonNode c, String id) {
        if (!c.isObject() || c.size() != 1) {
            throw new ValidonceFormatException("rule " + id + ": a condition is an object with exactly one key");
        }
        String op = c.fieldNames().next();
        JsonNode b = c.get(op);
        switch (op) {
            case "eq":
                return new Condition.Eq(field(b, op, id), scalarOf(b.get("value")));
            case "ne":
                return new Condition.Ne(field(b, op, id), scalarOf(b.get("value")));
            case "in": {
                JsonNode vs = b.get("values");
                if (vs == null || !vs.isArray() || vs.isEmpty()) {
                    throw new ValidonceFormatException("rule " + id + ": in needs a non-empty values array");
                }
                List<Object> values = new ArrayList<>();
                for (JsonNode v : vs) values.add(scalarOf(v));
                return new Condition.In(field(b, op, id), values);
            }
            case "present":
                return new Condition.Present(field(b, op, id));
            case "absent":
                return new Condition.Absent(field(b, op, id));
            case "all":
            case "any": {
                if (!b.isArray() || b.isEmpty()) {
                    throw new ValidonceFormatException("rule " + id + ": " + op + " needs a non-empty array");
                }
                List<Condition> cs = new ArrayList<>();
                for (JsonNode x : b) cs.add(readCondition(x, id));
                return op.equals("all") ? new Condition.All(cs) : new Condition.Any(cs);
            }
            case "not":
                return new Condition.Not(readCondition(b, id));
            default:
                throw new ValidonceFormatException("rule " + id + ": unknown condition " + op);
        }
    }

    private static String field(JsonNode b, String op, String id) {
        String f = b == null ? null : text(b, "field");
        if (f == null || f.isEmpty()) throw new ValidonceFormatException("rule " + id + ": " + op + " needs field");
        return f;
    }

    private static Object scalarOf(JsonNode v) {
        if (v == null) throw new ValidonceFormatException("a value is required");
        if (v.isTextual()) return v.asText();
        if (v.isBoolean()) return v.booleanValue();
        if (v.isNumber()) return v.doubleValue();
        throw new ValidonceFormatException("a value must be a string, number or boolean");
    }

    private static String text(JsonNode n, String key) {
        JsonNode v = n == null ? null : n.get(key);
        return v != null && v.isTextual() ? v.asText() : null;
    }
}
