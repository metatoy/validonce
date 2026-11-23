// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { Component, computed, inject, Injectable, signal } from "@angular/core";
import { form, FormField, validateStandardSchema } from "@angular/forms/signals";
import { fieldErrorsFromIssues, issuesFromResponse } from "validonce/server-errors";
import { withRules } from "validonce/zod";
import { z } from "zod";

export const messages: Record<string, string> = {
  "rules.company_required": "Company is required on the Pro plan",
  "rules.end_after_start": "End date must be on or after the start date",
  "rules.quantity_min": "Quantity must be at least {min}",
};

export const baseSchema = z.object({
  plan: z.enum(["free", "pro"]),
  company: z.string(),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  start: z.string().min(1, "Start date is required"),
  end: z.string(),
  quantity: z.number("Quantity is required"),
});

type Field = "plan" | "company" | "email" | "start" | "end" | "quantity";
const fields: Field[] = ["plan", "company", "email", "start", "end", "quantity"];

export const api = (new URLSearchParams(window.location.search).get("api") ?? "http://localhost:5080").replace(/\/$/, "");

/** Holds the server-derived schema; set once the OpenAPI document has loaded. */
@Injectable({ providedIn: "root" })
export class SchemaStore {
  readonly schema = signal<z.ZodObject | null>(null);
}

@Component({
  selector: "app-signup-form",
  imports: [FormField],
  templateUrl: "./signup-form.html",
  styleUrl: "./signup-form.css",
})
export class SignupForm {
  private readonly schema = inject(SchemaStore).schema;
  protected readonly skipClient = signal(false);
  protected readonly saved = signal(false);
  protected readonly showClient = signal(false);
  protected readonly serverErrors = signal<Record<string, string>>({});

  protected readonly model = signal<{
    plan: "free" | "pro";
    company: string;
    email: string;
    start: string;
    end: string;
    quantity: number | null;
  }>({ plan: "free", company: "", email: "", start: "", end: "", quantity: 1 });

  protected readonly f = form(this.model, (p) => {
    // The only cross-field rules come from the server's OpenAPI document.
    validateStandardSchema(p, this.schema() as z.ZodObject as never);
  });

  protected readonly errors = computed(() => {
    const out: Partial<Record<Field, string>> = {};
    const server = this.serverErrors();
    for (const name of fields) {
      const client = this.showClient()
        ? this.f[name]().errors().find((e) => e.message)?.message
        : undefined;
      const text = server[name] ?? client;
      if (text) out[name] = text;
    }
    return out;
  });

  protected onSkip(e: Event) {
    this.skipClient.set((e.target as HTMLInputElement).checked);
  }

  protected async submit(e: Event) {
    e.preventDefault();
    this.saved.set(false);
    this.serverErrors.set({});
    const v = this.model();
    if (this.skipClient()) {
      this.showClient.set(false);
      await this.post(v);
      return;
    }
    this.showClient.set(true);
    if (this.f().valid()) await this.post(v);
  }

  private async post(v: ReturnType<typeof this.model>) {
    const body = {
      ...v,
      company: v.company === "" ? null : v.company,
      end: v.end === "" ? null : v.end,
    };
    const res = await fetch(`${api}/signups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      this.saved.set(true);
      return;
    }
    const json: unknown = await res.json().catch(() => null);
    this.serverErrors.set(fieldErrorsFromIssues(issuesFromResponse(json), messages));
  }
}
