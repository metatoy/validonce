// @vitest-environment happy-dom
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { afterEach, describe, expect, it } from "vitest";
import { attachRules, readForm } from "../src/dom";
import type { Rule } from "../src/types";

const rules = [
  {
    id: "S.company",
    kind: "required_when",
    field: "company",
    when: { eq: { field: "plan", value: "pro" } },
    message: { key: "rules.company_required" },
  },
  {
    id: "S.end",
    kind: "compare",
    left: { field: "end" },
    op: "ge",
    right: { field: "start" },
    type: "date",
    message: { key: "rules.end_after_start" },
  },
  {
    id: "S.qty",
    kind: "compare",
    left: { field: "quantity" },
    op: "ge",
    right: { value: 1 },
    type: "number",
    message: { key: "rules.quantity_min", params: { min: 1 } },
  },
] as Rule[];

const messages = {
  "rules.company_required": "Company is required",
  "rules.end_after_start": "End must not precede start",
  "rules.quantity_min": "At least {min}",
};

function build(): HTMLFormElement {
  document.body.innerHTML = `
    <form>
      <label>Plan <select name="plan"><option value="free">free</option><option value="pro">pro</option></select></label>
      <label>Company <input name="company"></label>
      <label>Start <input type="date" name="start"></label>
      <label>End <input type="date" name="end"></label>
      <label>Qty <input type="number" name="quantity" value="1"></label>
      <label><input type="checkbox" name="agree"> Agree</label>
      <button type="submit">Go</button>
    </form>`;
  return document.querySelector("form") as HTMLFormElement;
}

const field = (f: HTMLFormElement, n: string) =>
  f.elements.namedItem(n) as HTMLInputElement;

function input(form: HTMLFormElement, name: string, value: string) {
  const el = field(form, name);
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("readForm", () => {
  it("reads number, date, empty and checkbox values", () => {
    const form = build();
    input(form, "start", "2026-03-10");
    input(form, "quantity", "2.5");
    field(form, "agree").checked = true;
    expect(readForm(form)).toEqual({
      plan: "free",
      company: null,
      start: "2026-03-10",
      end: null,
      quantity: 2.5,
      agree: true,
    });
    input(form, "quantity", "");
    field(form, "agree").checked = false;
    expect(readForm(form).quantity).toBeNull();
    expect(readForm(form).agree).toBe(false);
  });
});

describe("attachRules", () => {
  it("sets validity, text, aria-invalid and a linked live region", () => {
    const form = build();
    attachRules(form, rules, { messages });
    input(form, "plan", "pro");
    const company = field(form, "company");
    expect(company.validationMessage).toBe("Company is required");
    expect(company.getAttribute("aria-invalid")).toBe("true");
    const id = company.getAttribute("aria-describedby") as string;
    const err = document.getElementById(id) as HTMLElement;
    expect(err.textContent).toBe("Company is required");
    expect(err.hidden).toBe(false);
    expect(err.getAttribute("aria-live")).toBe("polite");
    input(form, "company", "Example Co");
    expect(company.validationMessage).toBe("");
    expect(company.hasAttribute("aria-invalid")).toBe(false);
    expect(err.hidden).toBe(true);
  });

  it("uses an existing [data-validonce-error] element", () => {
    const form = build();
    const p = document.createElement("p");
    p.setAttribute("data-validonce-error", "company");
    p.hidden = true;
    field(form, "company").closest("label")?.after(p);
    attachRules(form, rules, { messages });
    input(form, "plan", "pro");
    expect(p.textContent).toBe("Company is required");
    expect(form.querySelectorAll("[data-validonce-error]").length).toBe(1);
  });

  it("clears a stale custom message on every control before re-validating", () => {
    const form = build();
    const a = attachRules(form, rules, { messages });
    field(form, "company").setCustomValidity("stale");
    a.validate();
    expect(field(form, "company").validationMessage).toBe("");
  });

  it("changing start re-checks end without touching end", () => {
    const form = build();
    attachRules(form, rules, { messages });
    input(form, "start", "2026-03-10");
    input(form, "end", "2026-03-01");
    const end = field(form, "end");
    expect(end.validationMessage).toBe("End must not precede start");
    let touched = 0;
    end.addEventListener("input", () => touched++);
    end.addEventListener("change", () => touched++);
    input(form, "start", "2026-02-01");
    expect(touched).toBe(0);
    expect(end.validationMessage).toBe("");
    expect(end.hasAttribute("aria-invalid")).toBe(false);
  });

  it("blocks an invalid submit and lets a valid one through", () => {
    const form = build();
    attachRules(form, rules, { messages, reportValidity: false });
    input(form, "plan", "pro");
    input(form, "quantity", "0");
    const bad = new Event("submit", { cancelable: true, bubbles: true });
    form.dispatchEvent(bad);
    expect(bad.defaultPrevented).toBe(true);
    expect(field(form, "quantity").validationMessage).toBe("At least 1");
    input(form, "company", "Example Co");
    input(form, "quantity", "2");
    const ok = new Event("submit", { cancelable: true, bubbles: true });
    form.dispatchEvent(ok);
    expect(ok.defaultPrevented).toBe(false);
  });

  it("applies server errors (ASP.NET and FastAPI) in the same places", () => {
    const form = build();
    const a = attachRules(form, rules, { messages });
    const shown = a.applyServerErrors({
      validonce: [
        {
          path: ["company"],
          ruleId: "S.company",
          key: "rules.company_required",
          params: {},
        },
      ],
    });
    expect(shown).toEqual({ company: "Company is required" });
    expect(field(form, "company").validationMessage).toBe(
      "Company is required",
    );
    expect(field(form, "company").getAttribute("aria-invalid")).toBe("true");
    a.applyServerErrors({
      detail: [
        {
          type: "validonce.compare",
          loc: ["body", "quantity"],
          msg: "x",
          ctx: {
            ruleId: "S.qty",
            key: "rules.quantity_min",
            params: { min: 1 },
          },
        },
      ],
    });
    expect(field(form, "company").validationMessage).toBe("");
    expect(field(form, "quantity").validationMessage).toBe("At least 1");
    input(form, "quantity", "3");
    expect(field(form, "quantity").validationMessage).toBe("");
  });

  it("drives a form-associated custom element through ElementInternals", () => {
    const form = build();
    const calls: unknown[][] = [];
    const el = document.createElement("div") as unknown as HTMLElement &
      Record<string, unknown>;
    el.name = "company";
    el.value = "";
    el.internals = { setValidity: (...a: unknown[]) => calls.push(a) };
    // happy-dom lists only native controls in form.elements; add the element by hand.
    field(form, "company").closest("label")?.remove();
    form.append(el);
    const native = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(form),
      "elements",
    );
    Object.defineProperty(form, "elements", {
      configurable: true,
      get: () => [
        ...((native?.get?.call(form) as Iterable<Element>) ?? []),
        el,
      ],
    });
    attachRules(form, rules, { messages });
    const plan = form.querySelector("[name=plan]") as HTMLSelectElement;
    plan.value = "pro";
    plan.dispatchEvent(new Event("input", { bubbles: true }));
    const last = calls.at(-1) as unknown[];
    expect(last[0]).toEqual({ customError: true });
    expect(last[1]).toBe("Company is required");
    expect(el.getAttribute("aria-invalid")).toBe("true");
  });

  it("detach removes listeners, messages and attributes", () => {
    const form = build();
    const a = attachRules(form, rules, { messages });
    input(form, "plan", "pro");
    a.detach();
    const company = field(form, "company");
    expect(company.validationMessage).toBe("");
    expect(company.hasAttribute("aria-invalid")).toBe(false);
    expect(company.hasAttribute("aria-describedby")).toBe(false);
    expect(form.querySelectorAll("[data-validonce-error]").length).toBe(0);
    input(form, "plan", "pro");
    expect(company.validationMessage).toBe("");
    const ev = new Event("submit", { cancelable: true, bubbles: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe("<validonce-form>", () => {
  it("attaches rules set as a property to the slotted form", async () => {
    const { defineValidonceForm } = await import("../src/dom-element");
    defineValidonceForm();
    document.body.innerHTML = `<validonce-form><form>
      <select name="plan"><option value="free">free</option><option value="pro">pro</option></select>
      <input name="company"></form></validonce-form>`;
    const host = document.querySelector("validonce-form") as HTMLElement &
      Record<string, unknown>;
    host.messages = messages;
    host.rules = rules;
    const form = document.querySelector("form") as HTMLFormElement;
    const plan = form.querySelector("[name=plan]") as HTMLSelectElement;
    plan.value = "pro";
    plan.dispatchEvent(new Event("input", { bubbles: true }));
    const company = form.querySelector("[name=company]") as HTMLInputElement;
    expect(company.validationMessage).toBe("Company is required");
  });
});
