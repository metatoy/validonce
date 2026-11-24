// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.metatoy.validonce.Issue;
import com.metatoy.validonce.RuleDefinition;
import com.metatoy.validonce.RuleSet;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.List;
import org.hibernate.validator.constraintvalidation.HibernateConstraintValidatorContext;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Evaluates the rules against the wire form of the bean (its Jackson JSON value). Each issue is carried
 * as the violation's dynamic payload, which {@link ValidonceExceptionHandler} reads back.
 */
public class ValidonceRulesValidator implements ConstraintValidator<ValidonceRules, Object> {
    private static final ObjectMapper FALLBACK = new ObjectMapper().findAndRegisterModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    @Autowired(required = false)
    private ObjectMapper mapper;

    private Class<? extends RuleDefinition<?>> definition;

    /** Bean Validation returns violations as a set; the position restores the evaluator's order. */
    record Positioned(int position, Issue issue) {}

    @Override
    public void initialize(ValidonceRules annotation) {
        this.definition = annotation.value();
    }

    @Override
    public boolean isValid(Object value, ConstraintValidatorContext context) {
        if (value == null) return true;
        ObjectMapper m = mapper != null ? mapper : FALLBACK;
        RuleSet rules = RuleDefinitions.rulesFor(definition, m);
        JsonNode data = m.valueToTree(value);
        List<Issue> issues = rules.evaluate(data);
        if (issues.isEmpty()) return true;
        HibernateConstraintValidatorContext hv = context.unwrap(HibernateConstraintValidatorContext.class);
        context.disableDefaultConstraintViolation();
        for (int i = 0; i < issues.size(); i++) {
            Issue issue = issues.get(i);
            hv.withDynamicPayload(new Positioned(i, issue));
            hv.buildConstraintViolationWithTemplate(escape(issue.key()))
                    .addPropertyNode(issue.path().get(0))
                    .addConstraintViolation();
        }
        return false;
    }

    /** Message keys are literal text, not Bean Validation message templates. */
    private static String escape(String key) {
        return key.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("$", "\\$");
    }
}
