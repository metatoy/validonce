// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package example.registration;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.stereotype.Component;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = UniqueEmail.Check.class)
public @interface UniqueEmail {
    String message() default "this email belongs to another account";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    @Component
    class Check implements ConstraintValidator<UniqueEmail, Registration> {
        private final AccountRepository accounts;

        public Check(AccountRepository accounts) {
            this.accounts = accounts;
        }

        @Override
        public boolean isValid(Registration r, ConstraintValidatorContext c) {
            return !accounts.existsByEmailAndDisplayNameNot(r.getEmail(), r.getDisplayName());
        }
    }
}
