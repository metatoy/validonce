// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { Component, computed, effect, input, signal } from "@angular/core";
import { FormField, form, validateStandardSchema } from "@angular/forms/signals";
import type { Issue, RuleSet } from "validonce";
import { withRules } from "validonce/zod";
import {
  baseSchema,
  COUNTRIES,
  clientIssues,
  defaultValues,
  entriesByField,
  FIELDS,
  type Field,
  type FormValues,
  LABELS,
  messages,
  onSet,
  reportIssues,
  submitContact,
  toBody,
  touch,
} from "validonce-playground-frame-shared";
import { z } from "zod";
import { FieldErrors } from "./field-errors";

@Component({
  selector: "app-contact-form",
  imports: [FormField, FieldErrors],
  templateUrl: "./contact-form.html",
})
export class ContactForm {
  readonly rules = input.required<RuleSet>();
  readonly api = input.required<string>();

  protected readonly labels = LABELS;
  protected readonly countries = COUNTRIES;
  protected readonly skipClient = signal(false);
  protected readonly saved = signal(false);
  private readonly submitted = signal(false);
  private readonly touched = signal<Set<string>>(new Set());
  private readonly server = signal<Issue[]>([]);

  protected readonly model = signal<FormValues>({ ...defaultValues });

  protected readonly f = form(this.model, (p) => {
    // The inputs hold text; the schema wants null for an empty optional field.
    const schema = z.preprocess(
      (v) => toBody(v as FormValues),
      withRules(baseSchema, this.rules(), { messages }),
    );
    validateStandardSchema(p, schema as never);
  });

  protected readonly entries = computed(() => {
    const primary: Partial<Record<Field, string>> = {};
    for (const name of FIELDS) {
      const shown = this.submitted() || this.touched().has(name);
      const msg = this.f[name]()
        .errors()
        .find((e) => e.message)?.message;
      if (shown && msg) primary[name] = msg;
    }
    return entriesByField({
      rules: this.rules(),
      values: this.model(),
      primary,
      touched: this.touched(),
      submitted: this.submitted(),
      server: this.server(),
    });
  });

  constructor() {
    onSet((v) => this.skipClient.set(v));
    effect(() => reportIssues("client", clientIssues(this.rules(), this.model())));
  }

  protected edited(name: Field) {
    this.touched.set(touch(this.touched(), name, this.rules()));
    this.server.set([]);
    this.saved.set(false);
  }

  protected onSkip(e: Event) {
    this.skipClient.set((e.target as HTMLInputElement).checked);
  }

  protected async submit(e: Event) {
    e.preventDefault();
    this.saved.set(false);
    this.submitted.set(true);
    if (this.skipClient() || this.f().valid()) await this.post();
  }

  private async post() {
    const res = await submitContact(this.api(), this.model());
    this.server.set(res.issues);
    this.saved.set(res.ok);
  }
}
