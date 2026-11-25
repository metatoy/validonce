// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import "validonce-playground-frame-shared/frame.css";
import type { Issue, RuleSet } from "validonce";
import { attachRules, readForm } from "validonce/dom";
import { rulesFromOpenApi } from "validonce/openapi";
import {
  announceReady,
  applyTheme,
  clientIssues,
  defaultValues,
  type Entry,
  entriesByField,
  FIELDS,
  type Field,
  type FormValues,
  fetchOpenApi,
  fieldRuleMessages,
  messages,
  onSet,
  readParams,
  reportIssues,
  submitContact,
  touch,
} from "validonce-playground-frame-shared";

const params = readParams();
applyTheme(params.theme);

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}
function byTestId<T extends HTMLElement>(id: string): T {
  const e = document.querySelector<T>(`[data-testid="${id}"]`);
  if (!e) throw new Error(`missing ${id}`);
  return e;
}

async function main(): Promise<void> {
  const doc = await fetchOpenApi(params);
  const found = rulesFromOpenApi(doc, params.schema);
  if (!found) throw new Error(`no x-validonce rules for ${params.schema}`);
  const rules: RuleSet = found;

  const form = el<HTMLFormElement>("contact");
  const skip = el<HTMLInputElement>("skip");
  const result = el("result");
  let touched = new Set<string>();
  let submitted = false;
  let server: Issue[] = [];
  const open = new Set<Field>();

  function values(): FormValues {
    const raw = readForm(form);
    const out = { ...defaultValues };
    for (const f of FIELDS) out[f] = typeof raw[f] === "string" ? (raw[f] as string) : "";
    return out;
  }

  function renderOne(f: Field, list: Entry[]): void {
    const wrap = el(`error-wrap-${f}`);
    const text = byTestId(`error-${f}`);
    const badge = byTestId(`badge-server-${f}`);
    const more = byTestId<HTMLButtonElement>(`more-${f}`);
    const ul = byTestId(`error-more-${f}`);
    const [first, ...rest] = list;
    wrap.hidden = !first;
    text.hidden = false; // validonce/dom hides it when it has no error of its own
    text.textContent = first?.text ?? "";
    badge.hidden = !first?.server;
    more.hidden = rest.length === 0;
    more.textContent = open.has(f) ? "less" : `+${rest.length} more`;
    ul.hidden = !open.has(f) || rest.length === 0;
    ul.replaceChildren(
      ...rest.map((e) => {
        const li = document.createElement("li");
        li.textContent = e.text;
        if (e.server) {
          const b = document.createElement("span");
          b.className = "badge";
          b.textContent = "from the server";
          li.append(b);
        }
        return li;
      }),
    );
    const input = form.elements.namedItem(f);
    if (input instanceof HTMLElement) {
      if (first) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  }

  function render(): void {
    const v = values();
    const entries = entriesByField({
      rules,
      values: v,
      primary: {},
      extra: fieldRuleMessages(v),
      touched,
      submitted,
      server,
    });
    for (const f of FIELDS) renderOne(f, entries[f]);
    reportIssues("client", clientIssues(rules, v));
  }

  async function post(): Promise<void> {
    result.hidden = true;
    submitted = true;
    const res = await submitContact(params.api, values());
    server = res.issues;
    result.hidden = !res.ok;
    render();
  }

  // Registered before attachRules so "skip browser checks" can bypass its submit handler.
  form.addEventListener("submit", (e) => {
    if (!skip.checked) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void post();
  });
  attachRules(form, rules, { messages, reportValidity: false });
  // Run after attachRules' handlers, so they re-render what the library wrote.
  const onEdit = (e: Event) => {
    const name = (e.target as HTMLInputElement | null)?.name;
    if (!name) return;
    touched = touch(touched, name, rules);
    server = [];
    result.hidden = true;
    render();
  };
  form.addEventListener("input", onEdit);
  form.addEventListener("change", onEdit);
  form.addEventListener("submit", (e) => {
    if (e.defaultPrevented) {
      submitted = true;
      render();
      return;
    }
    e.preventDefault();
    submitted = true;
    // The rules passed; the field rules (email format, phone pattern) still decide.
    if (Object.keys(fieldRuleMessages(values())).length > 0) {
      render();
      return;
    }
    void post();
  });
  form.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("button.more");
    if (!t) return;
    const f = t.dataset.testid?.replace("more-", "") as Field | undefined;
    if (!f) return;
    if (open.has(f)) open.delete(f);
    else open.add(f);
    render();
  });
  onSet((v) => {
    skip.checked = v;
  });

  el("loading").hidden = true;
  form.hidden = false;
  announceReady("dom");
}

main().catch((e: unknown) => {
  el("loading").hidden = true;
  const err = el("load-error");
  err.textContent = String(e);
  err.hidden = false;
});
