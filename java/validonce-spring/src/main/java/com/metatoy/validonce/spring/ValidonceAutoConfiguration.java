// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/** Registers the 422 handler, the startup check and, when springdoc is present, the OpenAPI customizer. */
@AutoConfiguration(after = JacksonAutoConfiguration.class)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class ValidonceAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public ValidonceExceptionHandler validonceExceptionHandler(ObjectMapper mapper) {
        return new ValidonceExceptionHandler(mapper);
    }

    @Bean
    @ConditionalOnMissingBean
    public ValidonceTypes validonceTypes(ObjectProvider<RequestMappingHandlerMapping> mappings, ObjectMapper mapper) {
        return new ValidonceTypes(mappings, mapper);
    }

    @Configuration(proxyBeanMethods = false)
    @ConditionalOnClass(OpenApiCustomizer.class)
    static class SpringdocConfiguration {
        @Bean
        @ConditionalOnMissingBean
        public ValidonceOpenApiCustomizer validonceOpenApiCustomizer(ValidonceTypes types, ObjectMapper mapper) {
            return new ValidonceOpenApiCustomizer(types, mapper);
        }
    }
}
