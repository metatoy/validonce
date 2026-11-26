// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package example.signup;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = CompanyForPro.Check.class)
public @interface CompanyForPro {
    String message() default "company is required on the Pro plan";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Check implements ConstraintValidator<CompanyForPro, Signup> {
        @Override
        public boolean isValid(Signup s, ConstraintValidatorContext c) {
            if (!"pro".equals(s.getPlan()) || (s.getCompany() != null && !s.getCompany().isEmpty())) return true;
            c.disableDefaultConstraintViolation();
            c.buildConstraintViolationWithTemplate(c.getDefaultConstraintMessageTemplate())
                    .addPropertyNode("company")
                    .addConstraintViolation();
            return false;
        }
    }
}
