// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Where each backend lives. Dev: the example backends on their local ports (the same table the
// react-form example uses). Production build: https://play-api.metatoy.com/<backend>. `VITE_PLAYGROUND_API`
// (a base URL with no trailing slash) overrides the production base at build time; the e2e tests use it
// to point the shell at a stub.

import { BACKENDS as PORTS } from "../../../react-form/src/backends";

export const BACKEND_IDS = ["aspnet", "fastapi", "fastify", "nestjs", "go", "spring", "k8s"] as const;
export type BackendId = (typeof BACKEND_IDS)[number];

export const FRONTEND_IDS = ["react", "angular", "vue", "dom"] as const;
export type FrontendId = (typeof FRONTEND_IDS)[number];

export interface BackendInfo {
  id: BackendId;
  label: string;
  /** The language (or rule language) shown under the label. */
  sub: string;
  /** Local dev port. */
  port: number;
  /** Slug of docs/getting-started-<slug>.md; the Kubernetes option has its own guide. */
  doc: string;
  simulated?: boolean;
}

export const BACKENDS: readonly BackendInfo[] = [
  { id: "aspnet", label: "ASP.NET Core", sub: "C#", port: 5080, doc: "getting-started-aspnet.md" },
  { id: "fastapi", label: "FastAPI", sub: "Python", port: 8010, doc: "getting-started-fastapi.md" },
  { id: "fastify", label: "Fastify", sub: "TypeScript", port: 8020, doc: "getting-started-fastify.md" },
  { id: "nestjs", label: "NestJS", sub: "TypeScript", port: 8030, doc: "getting-started-nestjs.md" },
  { id: "go", label: "Go", sub: "Huma", port: 8040, doc: "getting-started-go.md" },
  { id: "spring", label: "Spring Boot", sub: "Java", port: 8050, doc: "getting-started-spring.md" },
  { id: "k8s", label: "Kubernetes CRD", sub: "CEL", port: 8060, doc: "kubernetes.md", simulated: true },
];

export interface FrontendInfo {
  id: FrontendId;
  label: string;
  sub: string;
}

export const FRONTENDS: readonly FrontendInfo[] = [
  { id: "react", label: "React", sub: "JSX" },
  { id: "angular", label: "Angular", sub: "TypeScript" },
  { id: "vue", label: "Vue", sub: "SFC" },
  { id: "dom", label: "Web components", sub: "custom elements" },
];

export function backendInfo(id: BackendId): BackendInfo {
  return BACKENDS.find((b) => b.id === id) as BackendInfo;
}

export interface Endpoint {
  /** Base URL, no trailing slash. */
  api: string;
  /** Path of the OpenAPI document (empty for the Kubernetes option). */
  openapi: string;
  /** The CRD the Kubernetes option reads instead of an OpenAPI document. */
  crd?: string;
}

const PROD_BASE = "https://play-api.metatoy.com";

function configuredBase(): string | undefined {
  const fromEnv = import.meta.env.VITE_PLAYGROUND_API as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return import.meta.env.MODE === "production" ? PROD_BASE : undefined;
}

export function endpointFor(id: BackendId, pageUrl: string = window.location.href): Endpoint {
  const base = configuredBase();
  const info = backendInfo(id);
  const dev = `http://localhost:${info.port}`;
  const api = base ? `${base}/${id}` : dev;
  if (id === "k8s") {
    return { api, openapi: "", crd: new URL("k8s/contact-crd.json", pageUrl).href };
  }
  const openapi = PORTS[String(info.port)]?.openapi ?? "/openapi.json";
  return { api, openapi };
}

/** The iframe URL for a pair. `theme` is only the first paint: later changes go by postMessage. */
export function frameUrl(
  frontend: FrontendId,
  backend: BackendId,
  theme: "light" | "dark",
  pageUrl: string = window.location.href,
): string {
  const e = endpointFor(backend, pageUrl);
  const p = new URLSearchParams({ api: e.api });
  if (e.crd) p.set("crd", e.crd);
  else p.set("openapi", e.openapi);
  p.set("schema", "Contact");
  p.set("theme", theme);
  p.set("embedded", "1");
  return new URL(`frames/${frontend}/index.html?${p.toString()}`, pageUrl).href;
}
