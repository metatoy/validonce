// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { endpointFor, type BackendId } from "./backends";

export interface XRule {
  id: string;
  kind: string;
  [k: string]: unknown;
}
export interface XValidonce {
  version: number;
  rules: XRule[];
}

/** The Contact schema's `x-validonce`: from the backend's live OpenAPI, or translated from the CRD. */
export async function loadRules(backend: BackendId): Promise<XValidonce> {
  const e = endpointFor(backend);
  if (e.crd) {
    const res = await fetch(e.crd);
    if (!res.ok) throw new Error(`CRD: HTTP ${res.status}`);
    const { translateCrd } = await import("validonce/kubernetes");
    const version = Object.values(translateCrd(await res.json()).versions)[0];
    return pick(version?.schema);
  }
  const res = await fetch(`${e.api}${e.openapi}`);
  if (!res.ok) throw new Error(`${e.openapi}: HTTP ${res.status}`);
  const doc = (await res.json()) as { components?: { schemas?: Record<string, unknown> } };
  return pick(doc.components?.schemas?.Contact);
}

function pick(schema: unknown): XValidonce {
  const x = (schema as Record<string, unknown> | undefined)?.["x-validonce"];
  if (!x || typeof x !== "object") throw new Error("no x-validonce on the Contact schema");
  return x as XValidonce;
}
