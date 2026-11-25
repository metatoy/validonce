// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Signup cross-field rules as a class-level Jakarta constraint (no validonce).
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.*;

@Signup.Rules
public class Signup {
  public String plan, company, email, start, end;
  public Double quantity;

  @Target(ElementType.TYPE)
  @Retention(RetentionPolicy.RUNTIME)
  @Constraint(validatedBy = Check.class)
  public @interface Rules {
    String message() default "invalid";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
  }

  static boolean blank(String s) { return s == null || s.isEmpty(); }

  /** Reports each violation on the wire field, so the runner can map the path. */
  static void fail(ConstraintValidatorContext c, String property) {
    c.buildConstraintViolationWithTemplate("invalid").addPropertyNode(property).addConstraintViolation();
  }

  public static class Check implements ConstraintValidator<Rules, Signup> {
    public boolean isValid(Signup m, ConstraintValidatorContext c) {
      c.disableDefaultConstraintViolation();
      boolean ok = true;
      if ("pro".equals(m.plan) && blank(m.company)) { fail(c, "company"); ok = false; }
      if (!blank(m.end) && !blank(m.start) && m.end.compareTo(m.start) < 0) { fail(c, "end"); ok = false; }
      if (m.quantity != null && m.quantity < 1) { fail(c, "quantity"); ok = false; }
      return ok;
    }
  }
}
