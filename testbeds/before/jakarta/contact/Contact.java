// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Contact cross-field rules as a class-level Jakarta constraint (no validonce).
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.*;

@Contact.Rules
public class Contact {
  public String email, phone, street, city, postalCode, country, availableFrom, availableTo;

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

  public static class Check implements ConstraintValidator<Rules, Contact> {
    public boolean isValid(Contact m, ConstraintValidatorContext c) {
      c.disableDefaultConstraintViolation();
      boolean ok = true;
      if (blank(m.email) && blank(m.phone)) { fail(c, "email"); ok = false; }
      int set = 0;
      for (String s : new String[] {m.street, m.city, m.postalCode}) if (!blank(s)) set++;
      if (set != 0 && set != 3) { fail(c, "street"); ok = false; }
      if ("US".equals(m.country) && blank(m.postalCode)) { fail(c, "postalCode"); ok = false; }
      if (!blank(m.availableTo) && !blank(m.availableFrom) && m.availableTo.compareTo(m.availableFrom) < 0) { fail(c, "availableTo"); ok = false; }
      return ok;
    }
  }
}
