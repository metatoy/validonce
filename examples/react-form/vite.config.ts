// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { backendAt } from "./src/backends";

// The form calls the backend through same-origin `/api`, so it works behind a forwarded port
// (a GitHub codespace) without CORS. VALIDONCE_API picks the backend; default is ASP.NET.
const target = process.env.VALIDONCE_API ?? "http://localhost:5080";
// VALIDONCE_OPENAPI overrides the document path from the backends table.
const openapi = process.env.VALIDONCE_OPENAPI ?? backendAt(target).openapi;

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
