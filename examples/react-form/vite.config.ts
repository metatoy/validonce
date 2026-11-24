// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The form calls the backend through same-origin `/api`, so it works behind a forwarded port
// (a GitHub codespace) without CORS. VALIDONCE_API picks the backend; default is ASP.NET.
const target = process.env.VALIDONCE_API ?? "http://localhost:5080";
// Where each example backend serves its OpenAPI document; VALIDONCE_OPENAPI overrides.
const openapiByPort: Record<string, string> = {
  "5080": "/openapi/v1.json", // ASP.NET
  "8010": "/openapi.json", // FastAPI
  "8020": "/openapi.json", // Fastify
  "8030": "/openapi.json", // NestJS
  "8040": "/openapi.json", // Go (Huma)
  "8050": "/v3/api-docs", // Spring (springdoc)
};
const openapi =
  process.env.VALIDONCE_OPENAPI ?? openapiByPort[new URL(target).port] ?? "/openapi/v1.json";

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
