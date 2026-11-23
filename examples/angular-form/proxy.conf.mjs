// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// The form calls the backend through same-origin `/api`. VALIDONCE_API picks the backend;
// default is ASP.NET. `/api/openapi.json` is rewritten to the backend's own document path.
const target = process.env.VALIDONCE_API ?? "http://localhost:5080";
const openapi = new URL(target).port === "8010" ? "/openapi.json" : "/openapi/v1.json";

export default {
  "/api": {
    target,
    changeOrigin: true,
    pathRewrite: { "^/api/openapi\\.json$": openapi, "^/api": "" },
  },
};
