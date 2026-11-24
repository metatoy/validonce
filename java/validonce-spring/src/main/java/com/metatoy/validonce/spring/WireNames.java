// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring;

import com.fasterxml.jackson.databind.BeanDescription;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.introspect.BeanPropertyDefinition;

/** Maps between Jackson (wire) property names and bean (Java) property names. */
final class WireNames {
    private WireNames() {}

    private static BeanDescription describe(ObjectMapper m, JavaType type) {
        return m.getSerializationConfig().introspect(type);
    }

    /** The bean property name for a wire name, or the name itself when there is no such property. */
    static String toBean(ObjectMapper m, Class<?> type, String wire) {
        for (BeanPropertyDefinition p : describe(m, m.constructType(type)).findProperties()) {
            if (p.getName().equals(wire)) return p.getInternalName();
        }
        return wire;
    }

    /** The property of {@code type} with this bean name, or null. */
    static BeanPropertyDefinition byBeanName(ObjectMapper m, JavaType type, String bean) {
        for (BeanPropertyDefinition p : describe(m, type).findProperties()) {
            if (p.getInternalName().equals(bean)) return p;
        }
        return null;
    }
}
