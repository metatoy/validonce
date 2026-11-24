// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.core.util.Separators;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

/**
 * With -Dvalidonce.export=PATH (the exportOpenApi task) writes the OpenAPI document; otherwise checks the
 * running app still produces the committed conformance/golden/spring.openapi.json.
 */
@SpringBootTest
@AutoConfigureMockMvc
class OpenApiExportTest {
    @Autowired
    MockMvc mvc;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private String export() throws Exception {
        String body = mvc.perform(get("/v3/api-docs")).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        ObjectNode doc = (ObjectNode) MAPPER.readTree(body);
        // The server URL depends on how the document was requested, so it is not part of the golden file.
        doc.remove("servers");
        DefaultPrettyPrinter pp = new DefaultPrettyPrinter()
                .withSeparators(Separators.createDefaultInstance().withObjectFieldValueSpacing(Separators.Spacing.AFTER));
        pp.indentArraysWith(DefaultIndenter.SYSTEM_LINEFEED_INSTANCE.withLinefeed("\n"));
        pp.indentObjectsWith(DefaultIndenter.SYSTEM_LINEFEED_INSTANCE.withLinefeed("\n"));
        return MAPPER.writer(pp).writeValueAsString(doc) + "\n";
    }

    @Test
    void exportsOrMatchesTheGoldenFile() throws Exception {
        String out = export();
        String target = System.getProperty("validonce.export");
        if (target != null) {
            Files.writeString(Path.of(target), out, StandardCharsets.UTF_8);
            return;
        }
        JsonNode actual = MAPPER.readTree(out);
        JsonNode golden = MAPPER.readTree(Files.readString(Path.of(System.getProperty("validonce.golden"))));
        assertThat(actual).as("run ./gradlew :spring-app:exportOpenApi to refresh the golden file").isEqualTo(golden);
        assertThat(actual.at("/components/schemas/Signup/x-validonce/rules")).hasSize(3);
    }
}
