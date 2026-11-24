// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;

/** An ordered, immutable list of rules: the {@code x-validonce} value of one object schema. */
public final class RuleSet {
    private final List<Rule> rules;

    public RuleSet(List<Rule> rules) {
        this.rules = List.copyOf(rules);
    }

    public List<Rule> rules() {
        return rules;
    }

    /** Parses rule-format data ({@code {"version":1,"rules":[...]}}). */
    public static RuleSet fromJson(JsonNode json) {
        return new RuleSet(Json.read(json));
    }

    /** The rule-format data, version 1. */
    public ObjectNode toJson() {
        return Json.write(rules);
    }

    /** Evaluates every rule (server side). */
    public List<Issue> evaluate(JsonNode data) {
        return Evaluator.evaluate(rules, data, Side.SERVER);
    }

    public List<Issue> evaluate(JsonNode data, Side side) {
        return Evaluator.evaluate(rules, data, side);
    }
}
