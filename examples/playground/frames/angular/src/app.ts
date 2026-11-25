// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { Component, inject, signal } from "@angular/core";
import type { RuleSet } from "validonce";
import { rulesFromOpenApi } from "validonce/openapi";
import {
  announceReady,
  applyTheme,
  fetchOpenApi,
  readParams,
} from "validonce-playground-frame-shared";
import { ContactForm, RulesStore } from "./contact-form";

@Component({
  selector: "app-root",
  imports: [ContactForm],
  template: `
    <main>
      @if (loadError(); as err) {
        <p class="load-error" data-testid="load-error">{{ err }}</p>
      }
      @if (rules()) {
        <app-contact-form [api]="params.api" />
      } @else if (!loadError()) {
        <p>Loading rules…</p>
      }
    </main>
  `,
})
export class App {
  protected readonly params = readParams();
  protected readonly rules = signal<RuleSet | null>(null);
  private readonly store = inject(RulesStore);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    applyTheme(this.params.theme);
    fetchOpenApi(this.params)
      .then((doc) => {
        const rs = rulesFromOpenApi(doc, this.params.schema);
        if (!rs) throw new Error(`no x-validonce rules for ${this.params.schema}`);
        this.rules.set(rs);
        this.store.rules.set(rs);
        announceReady("angular");
      })
      .catch((e: unknown) => this.loadError.set(String(e)));
  }
}
