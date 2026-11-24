// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// `<validonce-form>`: wraps a slotted <form> and attaches rules to it. Importing this
// module defines nothing; call `defineValidonceForm()` in the browser.

import { type Attached, attachRules, type RulesInput } from "./dom";
import type { Catalog } from "./messages";
import { rulesFromOpenApi } from "./openapi";
import { parseRuleSet } from "./parse";

export interface ValidonceFormElement extends HTMLElement {
  /** Rules to apply; setting it (re)attaches to the slotted form. */
  rules: RulesInput | null;
  messages: Catalog | undefined;
  validate(): ReturnType<Attached["validate"]> | undefined;
  applyServerErrors(body: unknown): Record<string, string>;
}

/**
 * Register the element (default tag `validonce-form`). Rules come from the `rules` property,
 * or from the `rules-url` attribute: a rules document, or an OpenAPI document together with
 * a `schema` attribute naming the component schema (e.g. `schema="Signup"`).
 */
export function defineValidonceForm(tag = "validonce-form"): void {
  if (customElements.get(tag)) return;
  class Element extends HTMLElement {
    static observedAttributes = ["rules-url", "schema"];
    #rules: RulesInput | null = null;
    #messages: Catalog | undefined;
    #attached: Attached | undefined;
    #token = 0;

    get rules(): RulesInput | null {
      return this.#rules;
    }
    set rules(v: RulesInput | null) {
      this.#rules = v;
      this.#bind();
    }
    get messages(): Catalog | undefined {
      return this.#messages;
    }
    set messages(v: Catalog | undefined) {
      this.#messages = v;
      this.#bind();
    }

    connectedCallback(): void {
      if (this.#rules) this.#bind();
      else void this.#load();
    }
    disconnectedCallback(): void {
      this.#attached?.detach();
      this.#attached = undefined;
    }
    attributeChangedCallback(): void {
      if (this.isConnected && !this.#rules) void this.#load();
    }

    validate() {
      return this.#attached?.validate();
    }
    applyServerErrors(body: unknown): Record<string, string> {
      return this.#attached?.applyServerErrors(body) ?? {};
    }

    #bind(): void {
      this.#attached?.detach();
      this.#attached = undefined;
      const form = this.querySelector("form");
      if (!form || !this.#rules || !this.isConnected) return;
      this.#attached = attachRules(form, this.#rules, {
        messages: this.#messages,
      });
      this.dispatchEvent(new CustomEvent("validonce-ready"));
    }

    async #load(): Promise<void> {
      const url = this.getAttribute("rules-url");
      if (!url) return;
      const mine = ++this.#token;
      try {
        const doc: unknown = await (await fetch(url)).json();
        if (mine !== this.#token) return;
        const schema = this.getAttribute("schema");
        const set = schema ? rulesFromOpenApi(doc, schema) : parseRuleSet(doc);
        if (!set) throw new Error(`no x-validonce rules for ${schema}`);
        this.#rules = set;
        this.#bind();
      } catch (e) {
        this.dispatchEvent(new CustomEvent("validonce-error", { detail: e }));
      }
    }
  }
  customElements.define(tag, Element);
}
