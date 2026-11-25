// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Maps an over-cap streamed body to 413; any other unreadable body keeps the default 400. */
@RestControllerAdvice
public class BodyLimitAdvice {
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Void> unreadable(HttpMessageNotReadableException e) throws HttpMessageNotReadableException {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof BodyLimitFilter.BodyTooLargeException) {
                return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).build();
            }
            if (t.getCause() == t) break;
        }
        throw e;
    }
}
