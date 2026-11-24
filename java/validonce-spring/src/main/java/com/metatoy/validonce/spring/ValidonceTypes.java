// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.metatoy.validonce.RuleSet;
import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Finds the {@link ValidonceRules} types used by the controllers (parameters and return types, one
 * level of generics) and builds their rules once the application has started. A wrong rule definition
 * (unknown field, unsupported compare type, id collision) therefore stops startup.
 */
public class ValidonceTypes implements SmartInitializingSingleton {
    private final ObjectProvider<RequestMappingHandlerMapping> mappings;
    private final ObjectMapper mapper;
    private volatile Map<Class<?>, RuleSet> rules;

    public ValidonceTypes(ObjectProvider<RequestMappingHandlerMapping> mappings, ObjectMapper mapper) {
        this.mappings = mappings;
        this.mapper = mapper;
    }

    @Override
    public void afterSingletonsInstantiated() {
        rules();
    }

    /** Annotated type to its rules, in discovery order. */
    public Map<Class<?>, RuleSet> rules() {
        Map<Class<?>, RuleSet> r = rules;
        if (r == null) {
            synchronized (this) {
                r = rules;
                if (r == null) {
                    Map<Class<?>, RuleSet> found = new LinkedHashMap<>();
                    mappings.orderedStream().forEach(m -> {
                        for (HandlerMethod hm : m.getHandlerMethods().values()) {
                            Method method = hm.getMethod();
                            for (Type t : method.getGenericParameterTypes()) collect(t, found);
                            collect(method.getGenericReturnType(), found);
                        }
                    });
                    r = rules = found;
                }
            }
        }
        return r;
    }

    private void collect(Type t, Map<Class<?>, RuleSet> found) {
        if (t instanceof ParameterizedType p) {
            for (Type a : p.getActualTypeArguments()) collect(a, found);
            collect(p.getRawType(), found);
        } else if (t instanceof Class<?> c) {
            ValidonceRules a = AnnotationUtils.findAnnotation(c, ValidonceRules.class);
            if (a != null && !found.containsKey(c)) found.put(c, RuleDefinitions.rulesFor(a.value(), mapper));
        }
    }
}
