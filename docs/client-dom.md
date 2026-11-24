# Client: plain HTML and web components

Use the server's rules in a plain HTML form, or in a form made of web components (Lit, Stencil, or your own). `validonce/dom` runs the rules in the browser and reports errors through the platform's own validation API, so `validationMessage`, `:invalid` and `form.reportValidity()` all work. It has no framework dependency. The same code works against ASP.NET Core and FastAPI.

```sh
pnpm add validonce
```

## 1. Load the rules

```ts
import { rulesFromOpenApi } from "validonce/openapi";

const doc: unknown = await (await fetch("http://localhost:5080/openapi/v1.json")).json();
const rules = rulesFromOpenApi(doc, "Signup"); // RuleSet | undefined
if (!rules) throw new Error("no x-validonce rules for Signup");
```

## 2. Attach them to the form

```html
<form id="signup" novalidate>
  <label>Plan
    <select name="plan"><option>free</option><option>pro</option></select>
  </label>
  <label>Company <input name="company"></label>
  <p data-validonce-error="company" hidden></p>
  <label>Start <input type="date" name="start"></label>
  <label>End <input type="date" name="end"></label>
  <label>Quantity <input type="number" name="quantity" value="1"></label>
  <button>Sign up</button>
</form>
```

```ts
import { attachRules } from "validonce/dom";

const messages = {
  "rules.company_required": "Company is required on the Pro plan",
  "rules.end_after_start": "End date must be on or after the start date",
  "rules.quantity_min": "Quantity must be at least {min}",
};

const form = document.querySelector<HTMLFormElement>("#signup")!;
const { validate, applyServerErrors, detach } = attachRules(form, rules, { messages });
```

What it does:

- **Reads the named controls.** A number input gives a number, or `null` when empty. A date input gives the ISO string. An empty text field gives `null`. A checkbox gives a boolean; a radio group gives the checked value. `readForm(form)` returns the same data.
- **Evaluates the client rules** (not `server_only` ones) and sets `setCustomValidity` on the control each error belongs to. Every control's custom message is cleared first, because a stale one would block submit.
- **Shows the text in an error element**, sets `aria-invalid="true"` on the control and links the two with `aria-describedby`. The element is a live region (`aria-live="polite"`), because the browser's own bubble is unstyled and read out poorly. The element is, in order: `[data-validonce-error="<name>"]` inside the form; one the control's `aria-describedby` already names; else a `<p>` created after the control's `<label>`.
- **Re-checks dependent fields.** Changing `plan` re-checks `company`; changing `start` re-checks `end`, without any event on `end`. The map comes from `dependentFields` in `validonce/deps`.
- **On submit** it validates everything. If anything fails it prevents the submit and calls `form.reportValidity()` (turn that off with `{ reportValidity: false }`).

`detach()` removes the listeners, clears every message and removes the attributes and error elements it added.

`<input type="datetime-local">` gives `YYYY-MM-DDTHH:mm`, which is not an instant to the rules. Convert it yourself if a rule compares `datetime` values.

## 3. Show server errors

The server can still reject a request the browser accepted. Pass the 422 body to `applyServerErrors`; it shows the issues in the same places (`validationMessage`, `aria-invalid`, the error element):

```ts
form.addEventListener("submit", async (e) => {
  if (e.defaultPrevented) return; // attachRules blocked an invalid submit
  e.preventDefault();
  const res = await fetch("http://localhost:5080/signups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(readForm(form)),
  });
  if (!res.ok) applyServerErrors(await res.json().catch(() => null));
});
```

It accepts the ASP.NET and FastAPI bodies (see [Client: React](client-react.md#the-two-422-shapes)) and returns the field → message map. A server error clears when the user edits that field.

### Progressive enhancement

The form works without JavaScript: give it an `action` and `method`, and have the server re-render the page on a 422. When the script loads, `attachRules` takes over: the same rules run in the browser first, and `fetch` plus `applyServerErrors` replace the full-page post. Keep `novalidate` off for the no-script case if you want the browser's built-in checks; with the script, the custom messages are the ones shown.

## Web components

A form-associated custom element (`static formAssociated = true`) appears in `form.elements`, so its `name` and `value` are read like any control. To show an error on it, expose its `ElementInternals` as `internals` (or implement `setCustomValidity(message)`). validonce then calls

```ts
internals.setValidity({ customError: true }, message, anchor);
```

`customError` is always `true`: WebKit drops the message otherwise. `anchor` is the first `input`, `select` or `textarea` in the element's shadow root, so the browser's bubble points at it. Expose `validationMessage` on the element if callers (or tests) should read it from the host.

Input events from inside a shadow root are `composed`, so the form sees `input` with the host as target. `change` is not composed: re-dispatch it from your element.

### Lit

Attach in `firstUpdated`, once the form is in the render root, and detach when the element leaves the page:

```ts
import { LitElement, html } from "lit";
import { attachRules, type Attached } from "validonce/dom";

class SignupForm extends LitElement {
  static properties = { rules: { attribute: false } };
  rules!: RuleSet;
  #attached?: Attached;

  // Light DOM keeps the form visible to document-level lookups (see the shadow-DOM caveat).
  createRenderRoot() { return this; }

  render() {
    return html`<form novalidate>
      <label>Company <input name="company"></label>
      <p data-validonce-error="company" hidden></p>
      <button>Sign up</button>
    </form>`;
  }

  firstUpdated() {
    this.#attached = attachRules(this.querySelector("form")!, this.rules, { messages });
  }
  disconnectedCallback() {
    this.#attached?.detach();
    super.disconnectedCallback();
  }
}
customElements.define("signup-form", SignupForm);
```

### Stencil

Attach in `componentDidLoad`:

```tsx
import { Component, Element, h, Prop } from "@stencil/core";
import { attachRules, type Attached } from "validonce/dom";

@Component({ tag: "signup-form", shadow: false })
export class SignupForm {
  @Element() host!: HTMLElement;
  @Prop() rules!: RuleSet;
  attached?: Attached;

  componentDidLoad() {
    this.attached = attachRules(this.host.querySelector("form")!, this.rules, { messages });
  }
  disconnectedCallback() {
    this.attached?.detach();
  }
  render() {
    return <form noValidate>{/* fields */}</form>;
  }
}
```

### The `<validonce-form>` element

An optional wrapper does the attaching for a `<form>` inside it. Rules come from the `rules` property, or from a `rules-url` attribute (a rules document, or an OpenAPI document with `schema="Signup"`):

```ts
import { defineValidonceForm } from "validonce/dom-element";
defineValidonceForm();
```

```html
<validonce-form rules-url="/api/openapi.json" schema="Signup">
  <form novalidate> … </form>
</validonce-form>
```

Set `messages` on the element as a property. It fires `validonce-ready` once attached and `validonce-error` if the rules fail to load, and has `validate()` and `applyServerErrors(body)` methods.

## Shadow-DOM caveat

`attachRules` looks at `form.elements`, so the form and its controls must be in the same tree, and the form must be inside the root you pass it. A form in a shadow root works if you attach from inside that component (as in the Lit and Stencil examples). It does not reach across a shadow boundary: a `<form>` in the light DOM cannot see inputs inside a child component's shadow root unless that component is form-associated. If you wrap native inputs in your own element without form association, make the wrapper form-associated, or render its input into the light DOM.

Error elements follow the same rule: `data-validonce-error` and `aria-describedby` are looked up in the form's own tree, and an `aria-describedby` reference cannot cross a shadow boundary. Put the error element next to the control in the same root.

Full working form, with one form-associated custom element: [examples/dom-form](../examples/dom-form/src/main.ts). Package reference: [js/README.md](../js/README.md).
