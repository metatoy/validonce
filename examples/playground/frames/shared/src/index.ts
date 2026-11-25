// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// What the four playground frames (React, Angular, Vue, plain DOM) share: the Contact message
// catalog, the URL parameters, the postMessage bridge to the shell, the request helper and the
// "one error per field, +1 more" view model. Each frame keeps its own form code.

import { evaluate, type Issue, type Rule } from "validonce";
import { dependentFields } from "validonce/deps";
import { type Catalog, formatMessage } from "validonce/messages";
import { issuesFromResponse } from "validonce/server-errors";
import { z } from "zod";

export type Framework = "react" | "angular" | "vue" | "dom";

/** The Contact fields, in form order. */
export const FIELDS = [
  "email",
  "phone",
  "street",
  "city",
  "postalCode",
  "country",
  "availableFrom",
  "availableTo",
] as const;
export type Field = (typeof FIELDS)[number];

export const LABELS: Record<Field, string> = {
  email: "Email",
  phone: "Phone",
  street: "Street",
  city: "City",
  postalCode: "Postal code",
  country: "Country",
  availableFrom: "Available from",
  availableTo: "Available to",
};

export const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "other", label: "Other" },
] as const;

/** The frontends' message catalog (examples/CONTRACT.md). */
export const messages: Catalog = {
  "rules.contact_email_or_phone": "Enter an email or a phone number",
  "rules.address_all_or_none": "Fill in street, city and postal code together",
  "rules.postal_code_required_us": "Postal code is required in the US",
  "rules.available_to_after_from": "Available to must be on or after available from",
};

/** The form's values as strings (inputs give "" for empty). */
export type FormValues = Record<Field, string>;

export const defaultValues: FormValues = {
  email: "",
  phone: "",
  street: "",
  city: "",
  postalCode: "",
  country: "US",
  availableFrom: "",
  availableTo: "",
};

/** The Contact body on the wire: empty text becomes null. */
export function toBody(values: FormValues): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of FIELDS) {
    const v = values[f].trim();
    out[f] = f === "country" ? values[f] : v === "" ? null : v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Field rules (standard JSON Schema in the contract): email format, phone pattern.
// ---------------------------------------------------------------------------

export const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;
export const EMAIL_MESSAGE = "Enter a valid email";
export const PHONE_MESSAGE = "Enter a valid phone number";

/** The Zod object for the field rules; `withRules` adds the cross-field rules on top. */
export const baseSchema = z.object({
  email: z.string().email(EMAIL_MESSAGE).nullable(),
  phone: z.string().regex(PHONE_PATTERN, PHONE_MESSAGE).nullable(),
  street: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.enum(["US", "CA", "GB", "other"]),
  availableFrom: z.string().nullable(),
  availableTo: z.string().nullable(),
});

/** Field-rule messages, for frames whose library has no schema (the plain DOM frame). */
export function fieldRuleMessages(values: FormValues): Partial<Record<Field, string[]>> {
  const out: Partial<Record<Field, string[]>> = {};
  const body = toBody(values);
  const email = body.email;
  if (email !== null && email !== undefined && !baseSchema.shape.email.safeParse(email).success) {
    out.email = [EMAIL_MESSAGE];
  }
  const phone = body.phone;
  if (phone !== null && phone !== undefined && !PHONE_PATTERN.test(phone)) {
    out.phone = [PHONE_MESSAGE];
  }
  return out;
}

// ---------------------------------------------------------------------------
// URL parameters
// ---------------------------------------------------------------------------

export interface FrameParams {
  /** Backend base URL, no trailing slash. */
  api: string;
  /** Path of the backend's OpenAPI document. */
  openapi: string;
  /** The component schema holding `x-validonce`. */
  schema: string;
  /** URL of a Kubernetes CRD manifest, read instead of the OpenAPI document (`?crd=`). */
  crd?: string;
  theme: "light" | "dark";
}

export function readParams(search: string = window.location.search): FrameParams {
  const p = new URLSearchParams(search);
  const api = (p.get("api") ?? "http://localhost:5080").replace(/\/$/, "");
  return {
    api,
    openapi: p.get("openapi") ?? "/openapi.json",
    schema: p.get("schema") ?? "Contact",
    crd: p.get("crd") ?? undefined,
    theme: p.get("theme") === "dark" ? "dark" : "light",
  };
}

export function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.dataset.theme = theme;
}

// ---------------------------------------------------------------------------
// postMessage bridge to the shell (window.parent). Target origin "*": the shell checks origin.
// ---------------------------------------------------------------------------

export interface RequestRecord {
  method: string;
  url: string;
  status: number;
  body: unknown;
  ms: number;
}

function send(message: Record<string, unknown>): void {
  try {
    window.parent.postMessage(message, "*");
  } catch (e) {
    console.warn("postMessage failed", e);
  }
}

export function announceReady(framework: Framework): void {
  send({ type: "validonce:ready", framework });
}

const lastIssues: Record<string, string> = {};

/** Tell the shell the current issues; repeats of the same list are not re-sent. */
export function reportIssues(source: "client" | "server", issues: readonly Issue[]): void {
  const key = JSON.stringify(issues);
  if (lastIssues[source] === key) return;
  lastIssues[source] = key;
  send({ type: "validonce:issues", source, issues });
}

export function reportRequest(record: RequestRecord): void {
  send({ type: "validonce:request", ...record });
}

/** Listen for `{type:"validonce:set", skipClient}` from the shell. */
export function onSet(handler: (skipClient: boolean) => void): void {
  window.addEventListener("message", (e: MessageEvent) => {
    const d: unknown = e.data;
    if (typeof d !== "object" || d === null) return;
    const m = d as { type?: unknown; skipClient?: unknown };
    if (m.type === "validonce:set" && typeof m.skipClient === "boolean") {
      handler(m.skipClient);
    }
  });
}

// ---------------------------------------------------------------------------
// Loading rules and submitting
// ---------------------------------------------------------------------------

export async function fetchOpenApi(params: FrameParams): Promise<unknown> {
  if (params.crd) return fetchCrd(params.crd, params.schema);
  const res = await fetch(`${params.api}${params.openapi}`);
  if (!res.ok) throw new Error(`OpenAPI document: HTTP ${res.status}`);
  return res.json();
}

export interface SubmitResult {
  ok: boolean;
  status: number;
  /** Server issues from a 422, in the order the server sent them. */
  issues: Issue[];
}

/** POST /contacts, report the request to the shell, and read the server's issues. */
export async function submitContact(api: string, values: FormValues): Promise<SubmitResult> {
  const url = `${api}/contacts`;
  const started = performance.now();
  let status = 0;
  let body: unknown = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toBody(values)),
    });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch (e) {
    body = { error: String(e) };
  }
  reportRequest({
    method: "POST",
    url,
    status,
    body,
    ms: Math.round(performance.now() - started),
  });
  const issues = status === 422 ? issuesFromResponse(body) : [];
  reportIssues("server", issues);
  return { ok: status >= 200 && status < 300, status, issues };
}

// ---------------------------------------------------------------------------
// The error view model: one error per field, "+1 more" for the rest
// ---------------------------------------------------------------------------

export interface Entry {
  text: string;
  /** True when the server sent this error. */
  server: boolean;
}

type RulesLike = readonly Rule[] | { readonly rules: readonly Rule[] };

function ruleList(rules: RulesLike): readonly Rule[] {
  return Array.isArray(rules)
    ? (rules as readonly Rule[])
    : (rules as { rules: readonly Rule[] }).rules;
}

/** Every client-side rule issue for the values (the cross-field rules only). */
export function clientIssues(rules: RulesLike, values: FormValues): Issue[] {
  return evaluate(ruleList(rules), toBody(values), { side: "client" });
}

/** Mark a field and the fields whose rules read it as touched (so their errors show). */
export function touch(touched: Set<string>, field: string, rules: RulesLike): Set<string> {
  const next = new Set(touched);
  next.add(field);
  for (const dep of dependentFields(rules)[field] ?? []) next.add(dep);
  // An all-or-none group is one address: editing one part shows the errors of all of it.
  for (const rule of ruleList(rules)) {
    const group = (rule as { kind: string; fields?: string[] }).fields;
    if (rule.kind === "all_or_none" && group?.includes(field)) {
      for (const f of group) next.add(f);
    }
  }
  return next;
}

export interface ViewState {
  rules: RulesLike;
  values: FormValues;
  /** The form library's own message per field (first error), when it has one. */
  primary: Partial<Record<Field, string | undefined>>;
  touched: ReadonlySet<string>;
  submitted: boolean;
  server: readonly Issue[];
  /** Field-rule messages computed here, for frames without a schema library. */
  extra?: Partial<Record<Field, string[]>>;
}

/**
 * The errors to show per field. The library's own message comes first; further messages for
 * the same field (other rules, field rules, server issues) follow, without repeats. Server
 * issues show whether or not the field was touched.
 */
export function entriesByField(s: ViewState): Record<Field, Entry[]> {
  const issues = clientIssues(s.rules, s.values);
  const out = {} as Record<Field, Entry[]>;
  for (const f of FIELDS) {
    const list: Entry[] = [];
    const add = (text: string | undefined, server: boolean) => {
      if (!text) return;
      const have = list.find((e) => e.text === text);
      if (have) {
        have.server = have.server || server;
      } else {
        list.push({ text, server });
      }
    };
    for (const issue of s.server) {
      if (issue.path.join(".") === f) add(formatMessage(issue, messages, ruleList(s.rules)), true);
    }
    if (s.submitted || s.touched.has(f) || s.primary[f]) {
      add(s.primary[f], false);
      for (const t of s.extra?.[f] ?? []) add(t, false);
      for (const issue of issues) {
        if (issue.path.join(".") === f)
          add(formatMessage(issue, messages, ruleList(s.rules)), false);
      }
    }
    out[f] = list;
  }
  return out;
}

/**
 * `?crd=`: fetch a Kubernetes CRD, translate its CEL with `translateCrd`, and return an OpenAPI-shaped
 * document, so the frames read the rules the same way as from a backend. The CRD's messages join the
 * catalog (the translated rules use `k8s.<Kind>.<n>` keys).
 */
async function fetchCrd(url: string, schema: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CRD: HTTP ${res.status}`);
  const { translateCrd } = await import("validonce/kubernetes");
  const version = Object.values(translateCrd(await res.json()).versions)[0];
  if (!version) throw new Error("the CRD has no versions");
  Object.assign(messages, version.catalog);
  return { openapi: "3.1.0", components: { schemas: { [schema]: version.schema } } };
}
