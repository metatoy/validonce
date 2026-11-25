// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { Component, computed, input, signal } from "@angular/core";
import type { Entry } from "validonce-playground-frame-shared";

@Component({
  selector: "app-field-errors",
  template: `
    <div class="errors" [id]="'error-wrap-' + name()" [hidden]="!first()">
      <div class="line">
        <span [attr.data-testid]="'error-' + name()">{{ first()?.text }}</span>
        @if (first()?.server) {
          <span class="badge" [attr.data-testid]="'badge-server-' + name()">from the server</span>
        }
        @if (rest().length > 0) {
          <button type="button" class="more" [attr.data-testid]="'more-' + name()" (click)="open.set(!open())">
            {{ open() ? "less" : "+" + rest().length + " more" }}
          </button>
        }
      </div>
      @if (open()) {
        <ul [attr.data-testid]="'error-more-' + name()">
          @for (e of rest(); track e.text) {
            <li>
              {{ e.text }}
              @if (e.server) {
                <span class="badge">from the server</span>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class FieldErrors {
  readonly name = input.required<string>();
  readonly entries = input.required<Entry[]>();
  protected readonly open = signal(false);
  protected readonly first = computed(() => this.entries()[0]);
  protected readonly rest = computed(() => this.entries().slice(1));
}
