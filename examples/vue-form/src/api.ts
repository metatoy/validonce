// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Default: same-origin `/api`, which the dev server proxies to the chosen backend (see
// vite.config.ts). `?api=http://host:port` still points the form at a backend directly.
const params = new URLSearchParams(window.location.search);
export const api = (params.get("api") ?? "/api").replace(/\/$/, "");
const proxied = api.startsWith("/");
const port = proxied ? "" : new URL(api).port;
export const backend = proxied ? "via /api proxy" : port === "8010" ? "FastAPI" : "ASP.NET";
// Through the proxy, /api/openapi.json is rewritten to each backend's own document path.
export const openapiPath =
  params.get("openapi") ?? (proxied || port === "8010" ? "/openapi.json" : "/openapi/v1.json");
