// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// A minimal form-associated custom element: a text field in a shadow root. It exposes its
// ElementInternals as `internals`, which is how validonce/dom shows an error on it.

export class VoTextField extends HTMLElement {
  static formAssociated = true;
  readonly internals: ElementInternals = this.attachInternals();
  #input: HTMLInputElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open", delegatesFocus: true });
    this.#input = document.createElement("input");
    this.#input.style.cssText = "padding:.4rem;font:inherit;width:100%;box-sizing:border-box";
    this.#input.addEventListener("input", () => this.internals.setFormValue(this.#input.value));
    root.append(this.#input);
  }

  get name(): string {
    return this.getAttribute("name") ?? "";
  }
  get type(): string {
    return "text";
  }
  get value(): string {
    return this.#input.value;
  }
  set value(v: string) {
    this.#input.value = v;
    this.internals.setFormValue(v);
  }
  get validationMessage(): string {
    return this.internals.validationMessage;
  }
  get validity(): ValidityState {
    return this.internals.validity;
  }
  formResetCallback(): void {
    this.value = "";
  }
}

customElements.define("vo-text-field", VoTextField);
