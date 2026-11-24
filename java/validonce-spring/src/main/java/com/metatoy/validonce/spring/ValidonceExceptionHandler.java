// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.spring;

import com.metatoy.validonce.Issue;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.hibernate.validator.engine.HibernateConstraintViolation;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.ObjectError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Answers a failed {@code @Valid} body with 422 and RFC 9457 problem details. The failing rules are a
 * top-level {@code validonce} member (the shape in docs/rule-format-v1.md, "Transport"). Other
 * validation failures (such as {@code @NotNull}) are listed in {@code errors}, field to messages.
 */
@RestControllerAdvice
public class ValidonceExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handle(MethodArgumentNotValidException ex) {
        List<ValidonceRulesValidator.Positioned> found = new ArrayList<>();
        List<Issue> issues = new ArrayList<>();
        Map<String, List<String>> errors = new LinkedHashMap<>();
        for (ObjectError e : ex.getBindingResult().getAllErrors()) {
            ValidonceRulesValidator.Positioned p = issueOf(e);
            if (p != null) {
                found.add(p);
            } else {
                String field = e instanceof org.springframework.validation.FieldError f ? f.getField() : "";
                errors.computeIfAbsent(field, k -> new ArrayList<>()).add(e.getDefaultMessage());
            }
        }
        found.stream().sorted(java.util.Comparator.comparingInt(ValidonceRulesValidator.Positioned::position))
                .forEach(p -> issues.add(p.issue()));
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY,
                "One or more validation errors occurred.");
        pd.setTitle("One or more validation errors occurred.");
        pd.setDetail(null);
        if (!errors.isEmpty()) pd.setProperty("errors", errors);
        pd.setProperty("validonce", issues);
        return ResponseEntity.unprocessableEntity().body(pd);
    }

    private static ValidonceRulesValidator.Positioned issueOf(ObjectError error) {
        ConstraintViolation<?> cv;
        try {
            cv = error.unwrap(ConstraintViolation.class);
        } catch (IllegalArgumentException e) {
            return null;
        }
        ValidonceRulesValidator.Positioned p = ((HibernateConstraintViolation<?>) cv.unwrap(HibernateConstraintViolation.class))
                .getDynamicPayload(ValidonceRulesValidator.Positioned.class);
        if (p == null) return null;
        Issue issue = p.issue();
        // The host's job: the full path, including any prefix from a nested object.
        List<String> path = new ArrayList<>();
        for (Path.Node n : cv.getPropertyPath()) {
            if (n.isInIterable() && n.getIndex() != null) path.add(String.valueOf(n.getIndex()));
            else if (n.isInIterable() && n.getKey() != null) path.add(String.valueOf(n.getKey()));
            if (n.getName() != null) path.add(n.getName());
        }
        return new ValidonceRulesValidator.Positioned(p.position(),
                issue.withPath(path.isEmpty() ? issue.path() : path));
    }
}
