// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Rejects POST /contacts bodies over 16 KB with 413, using the declared length. */
@Component
public class BodyLimitFilter extends OncePerRequestFilter {
    static final long MAX_BYTES = 16 * 1024;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"/contacts".equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        if (req.getContentLengthLong() > MAX_BYTES) {
            res.sendError(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            return;
        }
        chain.doFilter(req, res);
    }
}
