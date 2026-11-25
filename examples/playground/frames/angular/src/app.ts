// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { Component, signal } from "@angular/core";
import type { RuleSet } from "validonce";
import { rulesFromOpenApi } from "validonce/openapi";
import {
  announceReady,
  applyTheme,
  fetchOpenApi,
  readParams,
} from "validonce-playground-frame-shared";
import { ContactForm } from "./contact-form";

@Component({
  selector: "app-root",
  imports: [ContactForm],
  template: `
    <main>
      @if (loadError(); as err) {
        <p class="load-error" data-testid="load-error">{{ err }}</p>
      }
      @if (rules(); as r) {
        <app-contact-form [rules]="r" [api]="params.api" />
      } @else if (!loadError()) {
        <p>Loading rules…</p>
      }
    </main>
  `,
})
export class App {
  protected readonly params = readParams();
  protected readonly rules = signal<RuleSet | null>(null);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    applyTheme(this.params.theme);
    fetchOpenApi(this.params)
      .then((doc) => {
        const rs = rulesFromOpenApi(doc, this.params.schema);
        if (!rs) throw new Error(`no x-validonce rules for ${this.params.schema}`);
        this.rules.set(rs);
        announceReady("angular");
      })
      .catch((e: unknown) => this.loadError.set(String(e)));
  }
}
