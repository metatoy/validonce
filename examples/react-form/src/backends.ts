// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// The example backends, by port. One table for the form, the dev-server proxy and the e2e tests.

export interface Backend {
  /** Short id, used in screenshot names. */
  id: string;
  /** Shown on the page. */
  label: string;
  /** Where the backend serves its OpenAPI document. */
  openapi: string;
}

export const BACKENDS: Record<string, Backend> = {
  "5080": { id: "aspnet", label: "ASP.NET", openapi: "/openapi/v1.json" },
  "8010": { id: "fastapi", label: "FastAPI", openapi: "/openapi.json" },
  "8020": { id: "fastify", label: "Fastify", openapi: "/openapi.json" },
  "8030": { id: "nestjs", label: "NestJS", openapi: "/openapi.json" },
  "8040": { id: "go", label: "Go (Huma)", openapi: "/openapi.json" },
  "8050": { id: "spring", label: "Spring", openapi: "/v3/api-docs" },
};

/** The backend at a URL's port; unknown ports are treated as ASP.NET. */
export function backendAt(url: string): Backend {
  return BACKENDS[new URL(url).port] ?? (BACKENDS["5080"] as Backend);
}
