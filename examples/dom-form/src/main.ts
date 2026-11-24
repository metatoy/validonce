// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { attachRules, readForm } from "validonce/dom";
import type { Catalog } from "validonce/messages";
import { rulesFromOpenApi } from "validonce/openapi";
import "./vo-text-field";

const messages: Catalog = {
  "rules.company_required": "Company is required on the Pro plan",
  "rules.end_after_start": "End date must be on or after the start date",
  "rules.quantity_min": "Quantity must be at least {min}",
};

const params = new URLSearchParams(window.location.search);
// Default: same-origin `/api`, which the dev server proxies to the chosen backend (see
// vite.config.ts). `?api=http://host:port` still points the form at a backend directly.
const api = (params.get("api") ?? "/api").replace(/\/$/, "");
const proxied = api.startsWith("/");
const port = proxied ? "" : new URL(api).port;
const backend = proxied ? "via /api proxy" : port === "8010" ? "FastAPI" : "ASP.NET";
const openapiPath =
  params.get("openapi") ?? (proxied || port === "8010" ? "/openapi.json" : "/openapi/v1.json");

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

async function main(): Promise<void> {
  el("backend").textContent = `Backend: ${backend} (${api})`;
  const doc: unknown = await (await fetch(`${api}${openapiPath}`)).json();
  const rules = rulesFromOpenApi(doc, "Signup");
  if (!rules) throw new Error("no x-validonce rules for Signup");

  const form = el<HTMLFormElement>("signup");
  const skip = el<HTMLInputElement>("skip-client");
  const result = el("result");

  async function post(): Promise<void> {
    result.hidden = true;
    attached.applyServerErrors(null); // clear errors from an earlier response
    const res = await fetch(`${api}/signups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readForm(form)),
    });
    if (res.ok) {
      result.hidden = false;
      return;
    }
    const body: unknown = await res.json().catch(() => null);
    attached.applyServerErrors(body);
  }

  // Registered before attachRules so "skip browser checks" can bypass its submit handler.
  form.addEventListener("submit", (e) => {
    if (!skip.checked) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void post();
  });
  const attached = attachRules(form, rules, { messages });
  // Runs after attachRules' handler: only a form that passed the client rules gets here.
  form.addEventListener("submit", (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    void post();
  });

  el("loading").hidden = true;
  form.hidden = false;
}

main().catch((e: unknown) => {
  el("loading").hidden = true;
  const err = el("load-error");
  err.textContent = String(e);
  err.hidden = false;
});
