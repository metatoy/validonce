// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Browser-native form validation from validonce rules: plain HTML forms, Lit, Stencil and
// any other web-component stack. No framework, no runtime dependencies.

import { dependentFields } from "./deps";
import { evaluate } from "./evaluate";
import type { Catalog } from "./messages";
import { fieldErrorsFromIssues, issuesFromResponse } from "./server-errors";
import type { Rule } from "./types";

export type RulesInput = readonly Rule[] | { readonly rules: readonly Rule[] };

export interface AttachOptions {
  /** Message catalog: rule message key -> text, with `{param}` placeholders. */
  messages?: Catalog;
  /**
   * Call `form.reportValidity()` when a submit is blocked (default true). The text is
   * rendered into the linked error element either way.
   */
  reportValidity?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  /** Field name -> message, first issue per field. */
  errors: Record<string, string>;
}

export interface Attached {
  /** Read the form, evaluate the client rules, and show every error. */
  validate(): ValidationResult;
  /** Show the issues in a 422 response body (ASP.NET or FastAPI) in the same places. */
  applyServerErrors(body: unknown): Record<string, string>;
  /** Remove listeners, messages and the attributes this library added. */
  detach(): void;
}

/** A form-associated custom element that exposes its `ElementInternals` as `internals`. */
type Control = HTMLElement & {
  name?: string;
  type?: string;
  value?: unknown;
  checked?: boolean;
  setCustomValidity?: (message: string) => void;
  internals?: ElementInternals;
};

const SKIP_TAGS = new Set(["BUTTON", "FIELDSET", "OBJECT", "OUTPUT"]);
const SKIP_TYPES = new Set(["submit", "button", "reset", "image", "file"]);

function nameOf(el: Element): string {
  return (el as Control).name ?? el.getAttribute("name") ?? "";
}

function listRules(rules: RulesInput): readonly Rule[] {
  return Array.isArray(rules)
    ? (rules as readonly Rule[])
    : (rules as { rules: readonly Rule[] }).rules;
}

/** Named, value-carrying controls of a form, grouped by name in document order. */
function controlsByName(form: HTMLFormElement): Map<string, Control[]> {
  const out = new Map<string, Control[]>();
  for (const el of Array.from(form.elements)) {
    const c = el as Control;
    const name = nameOf(c);
    if (!name || SKIP_TAGS.has(c.tagName)) continue;
    if (typeof c.type === "string" && SKIP_TYPES.has(c.type)) continue;
    const list = out.get(name) ?? [];
    list.push(c);
    out.set(name, list);
  }
  return out;
}

function readOne(c: Control): unknown {
  const type = typeof c.type === "string" ? c.type : "";
  if (type === "checkbox") return c.checked === true;
  if (type === "number" || type === "range") {
    const raw = String(c.value ?? "").trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (type === "select-multiple") {
    const sel = c as unknown as HTMLSelectElement;
    return Array.from(sel.selectedOptions).map((o) => o.value);
  }
  const v = c.value;
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v === "" ? null : v;
  return v;
}

/**
 * The form's values, as the rules see them: number inputs give a number or null, date
 * inputs the ISO string, empty text null, a checkbox a boolean, a radio group the checked
 * value. Several checkboxes with one name give the array of checked values.
 */
export function readForm(form: HTMLFormElement): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [name, list] of controlsByName(form)) {
    const first = list[0] as Control;
    if (first.type === "radio") {
      const on = list.find((c) => c.checked === true);
      data[name] = on ? (on.value ?? null) : null;
    } else if (first.type === "checkbox" && list.length > 1) {
      data[name] = list.filter((c) => c.checked === true).map((c) => c.value);
    } else {
      data[name] = readOne(first);
    }
  }
  return data;
}

interface ErrorSlot {
  el: HTMLElement;
  created: boolean;
  hidden: boolean;
  text: string;
  hadId: boolean;
  liveSet: boolean;
}

function findErrorElement(
  form: HTMLFormElement,
  name: string,
  control: Control,
): HTMLElement | null {
  const root = form.getRootNode() as Document | ShadowRoot;
  for (const el of Array.from(
    form.querySelectorAll("[data-validonce-error]"),
  )) {
    if (el.getAttribute("data-validonce-error") === name)
      return el as HTMLElement;
  }
  const described = control.getAttribute("aria-describedby");
  if (described) {
    for (const id of described.split(/\s+/)) {
      const el = id ? root.getElementById?.(id) : null;
      if (el) return el as HTMLElement;
    }
  }
  return null;
}

/**
 * Bind rules to a form. Errors are written with `setCustomValidity` on the failing
 * control (so `validationMessage`, `:invalid` and `reportValidity()` all work) and as text
 * in an error element linked with `aria-describedby`.
 *
 * The error element is, in order: `[data-validonce-error="<name>"]` inside the form; an
 * element the control's `aria-describedby` already points at; else one created after the
 * control's `<label>` (or the control). A form-associated custom element must expose its
 * `ElementInternals` as `internals` (or implement `setCustomValidity`).
 */
export function attachRules(
  form: HTMLFormElement,
  rules: RulesInput,
  options: AttachOptions = {},
): Attached {
  const ruleList = listRules(rules);
  const messages = options.messages;
  const deps = dependentFields(ruleList);
  const slots = new Map<string, ErrorSlot>();
  const addedDescribedBy = new Map<Control, string>();
  let counter = 0;

  function control(name: string): Control | undefined {
    return controlsByName(form).get(name)?.[0];
  }

  function slotFor(name: string, c: Control): ErrorSlot {
    const have = slots.get(name);
    if (have) return have;
    let el = findErrorElement(form, name, c);
    let created = false;
    if (!el) {
      el = form.ownerDocument.createElement("p");
      el.setAttribute("data-validonce-error", name);
      el.hidden = true;
      const anchor = c.closest("label") ?? c;
      anchor.after(el);
      created = true;
    }
    const slot: ErrorSlot = {
      el,
      created,
      hidden: Boolean(el.hidden),
      text: el.textContent ?? "",
      hadId: el.id !== "",
      liveSet: el.hasAttribute("aria-live"),
    };
    if (!el.id) el.id = `validonce-error-${name}-${++counter}`;
    if (!slot.liveSet) el.setAttribute("aria-live", "polite");
    const tokens = (c.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean);
    if (!tokens.includes(el.id)) {
      c.setAttribute("aria-describedby", [...tokens, el.id].join(" "));
      addedDescribedBy.set(c, el.id);
    }
    slots.set(name, slot);
    return slot;
  }

  function setNative(c: Control, message: string): void {
    if (typeof c.setCustomValidity === "function") {
      c.setCustomValidity(message);
      return;
    }
    const internals = c.internals;
    if (internals) {
      if (message === "") {
        internals.setValidity({});
      } else {
        // customError must be true: WebKit ignores a message set with other flags only.
        const anchor = c.shadowRoot?.querySelector("input,select,textarea");
        internals.setValidity(
          { customError: true },
          message,
          (anchor as HTMLElement | null) ?? undefined,
        );
      }
    }
  }

  function show(name: string, message: string | null): void {
    const c = control(name);
    if (!c) return;
    const text = message ?? "";
    setNative(c, text);
    if (text) {
      c.setAttribute("aria-invalid", "true");
      const slot = slotFor(name, c);
      slot.el.textContent = text;
      slot.el.hidden = false;
    } else {
      c.removeAttribute("aria-invalid");
      const slot = slots.get(name);
      if (slot) {
        slot.el.textContent = "";
        slot.el.hidden = true;
      }
    }
  }

  function clearAll(): void {
    for (const name of controlsByName(form).keys()) show(name, null);
  }

  function evaluateNow(): Record<string, string> {
    const issues = evaluate(ruleList, readForm(form), { side: "client" });
    return fieldErrorsFromIssues(issues, messages, ruleList);
  }

  function validate(): ValidationResult {
    const errors = evaluateNow();
    clearAll();
    for (const [name, text] of Object.entries(errors)) show(name, text);
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function applyServerErrors(body: unknown): Record<string, string> {
    const issues = issuesFromResponse(body);
    const errors = fieldErrorsFromIssues(issues, messages, ruleList);
    clearAll();
    for (const [name, text] of Object.entries(errors)) show(name, text);
    return errors;
  }

  // Re-check one field and the fields whose rules read it; leave the rest as they are.
  function recheck(name: string): void {
    const errors = evaluateNow();
    for (const n of [name, ...(deps[name] ?? [])]) show(n, errors[n] ?? null);
  }

  function onInput(e: Event): void {
    const t = e.target as Element | null;
    if (!t || !form.contains(t)) return;
    const name = nameOf(t);
    if (name && controlsByName(form).has(name)) recheck(name);
  }

  function onSubmit(e: Event): void {
    const { valid } = validate();
    if (!valid) {
      e.preventDefault();
      if (options.reportValidity !== false) form.reportValidity();
    }
  }

  form.addEventListener("input", onInput);
  form.addEventListener("change", onInput);
  form.addEventListener("submit", onSubmit);

  function detach(): void {
    form.removeEventListener("input", onInput);
    form.removeEventListener("change", onInput);
    form.removeEventListener("submit", onSubmit);
    clearAll();
    for (const [c, id] of addedDescribedBy) {
      const left = (c.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter((t) => t && t !== id);
      if (left.length) c.setAttribute("aria-describedby", left.join(" "));
      else c.removeAttribute("aria-describedby");
    }
    addedDescribedBy.clear();
    for (const slot of slots.values()) {
      if (slot.created) {
        slot.el.remove();
        continue;
      }
      slot.el.textContent = slot.text;
      slot.el.hidden = slot.hidden;
      if (!slot.hadId) slot.el.removeAttribute("id");
      if (!slot.liveSet) slot.el.removeAttribute("aria-live");
    }
    slots.clear();
  }

  return { validate, applyServerErrors, detach };
}
