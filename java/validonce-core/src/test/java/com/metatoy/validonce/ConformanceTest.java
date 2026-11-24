// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/** Runs every shared conformance case, on the server side and on the client side. */
class ConformanceTest {
    static final int EXPECTED_CASES = 125;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static List<JsonNode> cases() throws IOException {
        Path dir = Path.of(System.getProperty("validonce.conformance"));
        List<Path> files = new ArrayList<>();
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir, "*.json")) {
            ds.forEach(files::add);
        }
        files.sort(null);
        List<JsonNode> out = new ArrayList<>();
        for (Path f : files) {
            JsonNode doc = MAPPER.readTree(f.toFile());
            assertThat(doc.get("version").intValue()).as(f.toString()).isEqualTo(1);
            doc.get("cases").forEach(out::add);
        }
        return out;
    }

    /** Numbers compare by value (1 equals 1.0), everything else structurally. */
    private static boolean same(JsonNode a, JsonNode b) {
        if (a.isNumber() && b.isNumber()) return a.decimalValue().compareTo(b.decimalValue()) == 0;
        if (a.isObject() && b.isObject()) {
            if (a.size() != b.size()) return false;
            var names = a.fieldNames();
            while (names.hasNext()) {
                String n = names.next();
                if (!b.has(n) || !same(a.get(n), b.get(n))) return false;
            }
            return true;
        }
        if (a.isArray() && b.isArray()) {
            if (a.size() != b.size()) return false;
            for (int i = 0; i < a.size(); i++) if (!same(a.get(i), b.get(i))) return false;
            return true;
        }
        return a.equals(b);
    }

    private static JsonNode issues(List<Issue> issues) {
        return MAPPER.valueToTree(issues);
    }

    @Test
    void thereAreTheExpectedNumberOfCases() throws IOException {
        List<JsonNode> cases = cases();
        assertThat(cases).isNotEmpty();
        assertThat(cases).hasSize(EXPECTED_CASES);
    }

    @TestFactory
    List<DynamicTest> serverSide() throws IOException {
        return run(Side.SERVER);
    }

    @TestFactory
    List<DynamicTest> clientSide() throws IOException {
        return run(Side.CLIENT);
    }

    private List<DynamicTest> run(Side side) throws IOException {
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : cases()) {
            tests.add(DynamicTest.dynamicTest(side + " " + c.get("id").asText() + ": " + c.get("description").asText(), () -> {
                RuleSet rules = RuleSet.fromJson(wrap(c.get("rules")));
                JsonNode expect = c.get("expect");
                if (side == Side.CLIENT) {
                    var kept = MAPPER.createArrayNode();
                    var serverOnly = new ArrayList<String>();
                    for (JsonNode r : c.get("rules")) {
                        if (r.path("server_only").asBoolean(false)) serverOnly.add(r.get("id").asText());
                    }
                    for (JsonNode e : expect) {
                        if (!serverOnly.contains(e.get("ruleId").asText())) kept.add(e);
                    }
                    expect = kept;
                }
                JsonNode actual = issues(rules.evaluate(c.get("data"), side));
                assertThat(same(actual, expect)).as("expected %s but got %s", expect, actual).isTrue();
            }));
        }
        assertThat(tests).hasSize(EXPECTED_CASES);
        return tests;
    }

    private static JsonNode wrap(JsonNode rules) {
        var o = MAPPER.createObjectNode();
        o.put("version", 1);
        o.set("rules", rules);
        return o;
    }
}
