// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.metatoy.validonce.RuleSet;
import java.lang.reflect.Method;
import java.lang.reflect.Type;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.introspect.BeanPropertyDefinition;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
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
                    Set<Class<?>> visited = new HashSet<>();
                    mappings.orderedStream().forEach(m -> {
                        for (HandlerMethod hm : m.getHandlerMethods().values()) {
                            Method method = hm.getMethod();
                            for (Type t : method.getGenericParameterTypes()) visit(mapper.constructType(t), found, visited);
                            visit(mapper.constructType(method.getGenericReturnType()), found, visited);
                        }
                    });
                    r = rules = found;
                }
            }
        }
        return r;
    }

    /**
     * Visits a type and everything reachable from it: container and array elements, type arguments and
     * the Jackson properties of each class (once per class).
     */
    private void visit(JavaType t, Map<Class<?>, RuleSet> found, Set<Class<?>> visited) {
        if (t == null) return;
        if (t.isContainerType() || t.isReferenceType()) {
            visit(t.getContentType(), found, visited);
            if (t.getKeyType() != null) visit(t.getKeyType(), found, visited);
            return;
        }
        for (JavaType arg : t.getBindings().getTypeParameters()) visit(arg, found, visited);
        Class<?> c = t.getRawClass();
        if (c.isPrimitive() || c.isEnum()) return;
        String pkg = c.getPackageName();
        if (pkg.startsWith("java.") || pkg.startsWith("javax.") || pkg.startsWith("jakarta.")
                || pkg.startsWith("jdk.") || pkg.startsWith("kotlin.") || pkg.startsWith("org.springframework.")) {
            return;
        }
        if (!visited.add(c)) return;
        ValidonceRules a = AnnotationUtils.findAnnotation(c, ValidonceRules.class);
        if (a != null) found.put(c, RuleDefinitions.rulesFor(a.value(), mapper));
        List<BeanPropertyDefinition> props;
        try {
            props = mapper.getSerializationConfig().introspect(t).findProperties();
        } catch (RuntimeException e) {
            return; // a type Jackson cannot introspect has nothing to add
        }
        for (BeanPropertyDefinition p : props) visit(p.getPrimaryType(), found, visited);
    }
}
