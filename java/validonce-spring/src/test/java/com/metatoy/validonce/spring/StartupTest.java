// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring;

import static org.assertj.core.api.Assertions.assertThat;

import com.metatoy.validonce.Op;
import com.metatoy.validonce.RuleDefinition;
import com.metatoy.validonce.RuleSetBuilder;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

class StartupTest {
    record Good(String a, String b) {}

    record Bad(String a, String b) {}

    @ValidonceRules(BadRules.class)
    record Annotated(String a) {}

    static final class BadRules extends RuleDefinition<Annotated> {
        BadRules() {
            super(Annotated.class);
        }

        @Override
        protected void define(RuleSetBuilder<Annotated> r) {
            r.compare("a", Op.GE, "missing");
        }
    }

    @RestController
    static class Controller {
        @PostMapping("/x")
        void post(@RequestBody Annotated body) {}
    }

    private final WebApplicationContextRunner runner = new WebApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class, WebMvcAutoConfiguration.class,
                    ValidonceAutoConfiguration.class))
            .withUserConfiguration(Controller.class);

    @Test
    void aWrongRuleDefinitionStopsStartup() {
        runner.run(ctx -> {
            assertThat(ctx).hasFailed();
            assertThat(ctx.getStartupFailure()).hasStackTraceContaining("no JSON property 'missing'");
        });
    }
}
