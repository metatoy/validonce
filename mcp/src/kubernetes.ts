// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { translateCrd, translateKubernetesOpenApi, type KubernetesRuleReport } from "validonce/kubernetes";

/** A document above this many serialized characters is summarized per schema instead of returned. */
export const INLINE_DOC_CHARS = 120_000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export interface TranslateOut {
  kind: "crd" | "openapi";
  catalog: Record<string, string>;
  report: KubernetesRuleReport[];
  counts: { translated: number; server_only: number };
  /** The augmented document (or, for a CRD, { version: schema }); absent when too large. */
  document?: unknown;
  /** Per-schema summary, always present when the document is omitted. */
  schemas?: Array<{ schema: string; translated: number; server_only: number }>;
  documentOmitted?: string;
}

export function translateKubernetes(doc: unknown): TranslateOut {
  if (!isObj(doc)) throw new Error("not an object");
  const isCrd = doc.kind === "CustomResourceDefinition" || (isObj(doc.spec) && Array.isArray((doc.spec as Obj).versions));
  let kind: "crd" | "openapi";
  let augmented: unknown;
  let catalog: Record<string, string> = {};
  const report: KubernetesRuleReport[] = [];
  if (isCrd) {
    kind = "crd";
    const { versions } = translateCrd(doc);
    const byVersion: Obj = {};
    for (const [v, r] of Object.entries(versions)) {
      byVersion[v] = r.schema;
      Object.assign(catalog, r.catalog);
      report.push(...r.report);
    }
    augmented = byVersion;
  } else {
    kind = "openapi";
    const r = translateKubernetesOpenApi(doc);
    augmented = r.doc;
    catalog = r.catalog;
    report.push(...r.report);
  }
  const translated = report.filter((r) => r.outcome === "translated").length;
  const out: TranslateOut = {
    kind,
    catalog,
    report,
    counts: { translated, server_only: report.length - translated },
  };
  if (JSON.stringify(augmented).length <= INLINE_DOC_CHARS) out.document = augmented;
  else {
    const per = new Map<string, { translated: number; server_only: number }>();
    for (const r of report) {
      const e = per.get(r.schema) ?? { translated: 0, server_only: 0 };
      e[r.outcome === "translated" ? "translated" : "server_only"]++;
      per.set(r.schema, e);
    }
    out.schemas = [...per].map(([schema, c]) => ({ schema, ...c }));
    out.documentOmitted = `The augmented document is larger than ${INLINE_DOC_CHARS} characters. Run \`npx validonce k8s\` to write it to a file, or pass one CRD at a time.`;
  }
  return out;
}
