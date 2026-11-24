// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.metatoy.validonce.RuleSet;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.Schema;
import java.util.Map;
import org.springdoc.core.customizers.OpenApiCustomizer;

/**
 * Adds {@code x-validonce} to the component schema of every {@link ValidonceRules} type used by a
 * controller. The schema is matched by the class's simple name, which is springdoc's default schema name.
 */
public class ValidonceOpenApiCustomizer implements OpenApiCustomizer {
    private final ValidonceTypes types;
    private final ObjectMapper mapper;

    public ValidonceOpenApiCustomizer(ValidonceTypes types, ObjectMapper mapper) {
        this.types = types;
        this.mapper = mapper;
    }

    @Override
    @SuppressWarnings("rawtypes")
    public void customise(OpenAPI openApi) {
        if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) return;
        Map<String, Schema> schemas = openApi.getComponents().getSchemas();
        types.rules().forEach((type, rules) -> add(schemas.get(type.getSimpleName()), rules));
    }

    @SuppressWarnings("rawtypes")
    private void add(Schema schema, RuleSet rules) {
        if (schema == null) return;
        // A plain Map keeps the extension independent of the mapper's settings.
        schema.addExtension("x-validonce", mapper.convertValue(rules.toJson(), Map.class));
    }
}
