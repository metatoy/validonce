// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The form calls the backend through same-origin `/api`, so it works behind a forwarded port
// (a GitHub codespace) without CORS. VALIDONCE_API picks the backend; default is ASP.NET.
const target = process.env.VALIDONCE_API ?? "http://localhost:5080";
const openapi = new URL(target).port === "8010" ? "/openapi.json" : "/openapi/v1.json";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: [".app.github.dev", "localhost"],
    proxy: {
      "/api/openapi.json": { target, changeOrigin: true, rewrite: () => openapi },
      "/api": { target, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
