// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.metatoy.validonce.RuleDefinition;
import com.metatoy.validonce.RuleSet;
import java.lang.reflect.Constructor;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** One instance per {@link RuleDefinition} class, so the rules are built (and checked) once. */
final class RuleDefinitions {
    private static final Map<Class<?>, RuleDefinition<?>> INSTANCES = new ConcurrentHashMap<>();

    private RuleDefinitions() {}

    static RuleSet rulesFor(Class<? extends RuleDefinition<?>> definition, ObjectMapper mapper) {
        return INSTANCES.computeIfAbsent(definition, RuleDefinitions::instantiate).rules(mapper);
    }

    private static RuleDefinition<?> instantiate(Class<?> c) {
        try {
            Constructor<?> k = c.getDeclaredConstructor();
            k.setAccessible(true);
            return (RuleDefinition<?>) k.newInstance();
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(c.getName() + " needs a no-argument constructor", e);
        }
    }
}
