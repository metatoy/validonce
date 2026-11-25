// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { Catalog } from "./messages";
import type { Issue } from "./types";

/** Rule id and message key on every issue made from a Kubernetes `Status`. */
export const K8S_SERVER_RULE_ID = "k8s.server";

/**
 * Catalog entry that shows the API server's own text. Merge it into your catalog
 * (`{ ...catalog, ...k8sServerCatalog }`) so `formatMessage` and `fieldErrorsFromIssues`
 * print the message Kubernetes wrote.
 */
export const k8sServerCatalog: Catalog = { [K8S_SERVER_RULE_ID]: "{message}" };

export interface DryRunOptions {
  /**
   * The path the form's fields are relative to. Default `"spec"`, so `spec.end` becomes
   * `["end"]`. Use `""` to keep the full path from the object root (`["spec", "end"]`).
   * A field outside `root` (for example `metadata.name`) keeps its full path.
   */
  root?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Adds `dryRun=All` to a resource URL, replacing any existing `dryRun`. Works on absolute
 * URLs and on paths such as `/apis/example.test/v1/namespaces/default/signups`.
 */
export function dryRunUrl(resourceUrl: string): string {
  const hashAt = resourceUrl.indexOf("#");
  const hash = hashAt === -1 ? "" : resourceUrl.slice(hashAt);
  const rest = hashAt === -1 ? resourceUrl : resourceUrl.slice(0, hashAt);
  const q = rest.indexOf("?");
  const base = q === -1 ? rest : rest.slice(0, q);
  const params = new URLSearchParams(q === -1 ? "" : rest.slice(q + 1));
  params.set("dryRun", "All");
  return `${base}?${params.toString()}${hash}`;
}

/**
 * Splits a Kubernetes field path into segments: `spec.items[2].end` ->
 * `["spec", "items", "2", "end"]`. Map keys come as `[key]` or `["key"]`; a quoted key
 * may contain dots.
 */
export function splitFieldPath(field: string): string[] {
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur !== "") out.push(cur);
    cur = "";
  };
  let i = 0;
  while (i < field.length) {
    const c = field[i] as string;
    if (c === ".") {
      flush();
      i++;
    } else if (c === "[") {
      flush();
      i++;
      if (field[i] === '"') {
        i++;
        let key = "";
        while (i < field.length && field[i] !== '"') {
          if (field[i] === "\\" && i + 1 < field.length) i++;
          key += field[i];
          i++;
        }
        i++; // closing quote
        if (field[i] === "]") i++;
        out.push(key);
      } else {
        const end = field.indexOf("]", i);
        const stop = end === -1 ? field.length : end;
        out.push(field.slice(i, stop));
        i = stop + 1;
      }
    } else {
      cur += c;
      i++;
    }
  }
  flush();
  return out;
}

// `Invalid value: "object": text`, `Invalid value: 5: text`, `Required value: text` ...
const PREFIX =
  /^(?:(?:Invalid|Unsupported|Duplicate) value: (?:"(?:[^"\\]|\\.)*"|[^:]*?): |(?:Required value|Forbidden|Too long|Too many|Not found)(?:: )?)/;

/** The text after Kubernetes' `Invalid value: <v>: ` prefix; the raw text if nothing is left. */
function cleanMessage(raw: string): string {
  const stripped = raw.replace(PREFIX, "").trim();
  return stripped === "" ? raw : stripped;
}

function relativePath(field: string, root: string): string[] {
  const full = splitFieldPath(field);
  const base = splitFieldPath(root);
  if (base.length === 0) return full;
  if (base.length <= full.length && base.every((s, i) => full[i] === s)) {
    return full.slice(base.length);
  }
  return full;
}

/**
 * Issues from a Kubernetes `Status` failure (HTTP 422, `reason: Invalid`), for example the
 * answer to a request sent with `dryRun=All`. One issue per entry of `details.causes[]`;
 * `field` becomes the path, relative to `options.root` (default `"spec"`).
 *
 * Each issue has `ruleId` and `key` `k8s.server` and `params: { message, reason }`. `message`
 * is the server's text without Kubernetes' `Invalid value: ...:` prefix; `reason` is the
 * cause's reason (`FieldValueInvalid`, `FieldValueRequired`, ...). Add `k8sServerCatalog`
 * to your catalog to show the text. Anything that is not an `Invalid` Status returns `[]`.
 *
 * An error on the root object itself (a CEL rule with no `fieldPath`, attached to `spec`)
 * has an empty `path`; show it as a form-level error.
 */
export function dryRunIssues(
  body: unknown,
  options: DryRunOptions = {},
): Issue[] {
  if (!isRecord(body)) return [];
  if (body.kind !== "Status" || body.status !== "Failure") return [];
  if (body.reason !== "Invalid" && body.code !== 422) return [];
  const root = options.root ?? "spec";
  const details = isRecord(body.details) ? body.details : {};
  const causes = Array.isArray(details.causes) ? details.causes : [];
  const out: Issue[] = [];
  for (const cause of causes) {
    if (!isRecord(cause)) continue;
    const raw = typeof cause.message === "string" ? cause.message : "";
    const field = typeof cause.field === "string" ? cause.field : "";
    const reason = typeof cause.reason === "string" ? cause.reason : "";
    out.push({
      path: relativePath(field, root),
      ruleId: K8S_SERVER_RULE_ID,
      key: K8S_SERVER_RULE_ID,
      params: { message: cleanMessage(raw), reason },
    });
  }
  if (out.length === 0 && typeof body.message === "string") {
    out.push({
      path: [],
      ruleId: K8S_SERVER_RULE_ID,
      key: K8S_SERVER_RULE_ID,
      params: { message: body.message, reason: "Invalid" },
    });
  }
  return out;
}
