// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { Component, inject, signal } from "@angular/core";
import { rulesFromOpenApi } from "validonce/openapi";
import { withRules } from "validonce/zod";
import { api, baseSchema, messages, SchemaStore, SignupForm } from "./signup-form";

const port = new URL(api).port;
const backend = port === "8010" ? "FastAPI" : "ASP.NET";
const openapiPath =
  new URLSearchParams(window.location.search).get("openapi") ??
  (port === "8010" ? "/openapi.json" : "/openapi/v1.json");

@Component({
  selector: "app-root",
  imports: [SignupForm],
  template: `
    <main>
      <h1>Sign up</h1>
      <p data-testid="backend">Backend: {{ backend }} ({{ api }})</p>
      @if (loadError(); as err) {
        <p class="error">{{ err }}</p>
      }
      @if (store.schema()) {
        <app-signup-form />
      } @else if (!loadError()) {
        <p>Loading rules…</p>
      }
    </main>
  `,
  styles: `
    main { max-width: 420px; margin: 2rem auto; padding: 0 1rem; }
    .error { color: #9b2c1d; margin: 0; }
  `,
})
export class App {
  protected readonly backend = backend;
  protected readonly api = api;
  protected readonly loadError = signal<string | null>(null);
  protected readonly store = inject(SchemaStore);

  constructor() {
    fetch(`${api}${openapiPath}`)
      .then((r) => r.json())
      .then((doc: unknown) => {
        const rules = rulesFromOpenApi(doc, "Signup");
        if (!rules) throw new Error("no x-validonce rules for Signup");
        this.store.schema.set(withRules(baseSchema, rules, { messages }));
      })
      .catch((e: unknown) => this.loadError.set(String(e)));
  }
}
