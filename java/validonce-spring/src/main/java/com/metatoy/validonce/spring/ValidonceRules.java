// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring;

import com.metatoy.validonce.RuleDefinition;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Class-level constraint that runs a type's validonce rules inside the standard {@code @Valid} flow.
 * Each failing rule becomes one constraint violation, reported on the rule's path, and
 * {@link ValidonceExceptionHandler} turns them into the 422 problem details.
 *
 * <pre>{@code
 * @ValidonceRules(SignupRules.class)
 * public record Signup(...) {}
 * }</pre>
 */
@Documented
@Constraint(validatedBy = ValidonceRulesValidator.class)
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidonceRules {
    /** The rule definition: a class with a no-argument constructor. */
    Class<? extends RuleDefinition<?>> value();

    String message() default "validonce rules";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
