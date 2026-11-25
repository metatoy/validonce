// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package com.metatoy.validonce.example;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Caps POST /contacts bodies at 16 KB. A declared Content-Length over the cap gets 413 at once; the
 * request stream is also counted, so chunked and streamed bodies throw {@link BodyTooLargeException}
 * (mapped to 413 by {@link BodyLimitAdvice}) once they pass the cap.
 */
@Component
public class BodyLimitFilter extends OncePerRequestFilter {
    static final long MAX_BYTES = 16 * 1024;

    /** Thrown from the request stream when the body passes the cap. */
    public static final class BodyTooLargeException extends IOException {
        BodyTooLargeException() {
            super("Request body exceeds " + MAX_BYTES + " bytes");
        }
    }

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
        chain.doFilter(new Limited(req), res);
    }

    private static final class Limited extends HttpServletRequestWrapper {
        private ServletInputStream stream;

        Limited(HttpServletRequest request) {
            super(request);
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (stream == null) {
                stream = new Counting(super.getInputStream());
            }
            return stream;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            String enc = getCharacterEncoding();
            Charset cs = enc == null ? StandardCharsets.UTF_8 : Charset.forName(enc);
            return new BufferedReader(new InputStreamReader(getInputStream(), cs));
        }
    }

    private static final class Counting extends ServletInputStream {
        private final ServletInputStream in;
        private long count;

        Counting(ServletInputStream in) {
            this.in = in;
        }

        private void add(long n) throws IOException {
            if (n > 0 && (count += n) > MAX_BYTES) {
                throw new BodyTooLargeException();
            }
        }

        @Override
        public int read() throws IOException {
            int b = in.read();
            add(b < 0 ? 0 : 1);
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            int n = in.read(buf, off, len);
            add(n);
            return n;
        }

        @Override
        public boolean isFinished() {
            return in.isFinished();
        }

        @Override
        public boolean isReady() {
            return in.isReady();
        }

        @Override
        public void setReadListener(ReadListener listener) {
            in.setReadListener(listener);
        }
    }
}
