// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import "@angular/compiler";
import { DOCUMENT } from "@angular/common";
import {
  Injector,
  provideZonelessChangeDetection,
  signal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormControl, FormGroup, Validators } from "@angular/forms";
import { form, validateStandardSchema } from "@angular/forms/signals";
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from "@angular/platform-browser/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { validonceGroupValidator } from "../src/angular";
import type { Rule } from "../src/types";
import { withRules } from "../src/zod";

const rules: Rule[] = [
  {
    id: "Signup.required_when.company",
    kind: "required_when",
    field: "company",
    when: { eq: { field: "plan", value: "pro" } },
    message: { key: "rules.company_required" },
  },
  {
    id: "Trip.compare.end",
    kind: "compare",
    left: { field: "end" },
    op: "ge",
    right: { field: "start" },
    type: "date",
    message: { key: "rules.end_after_start", params: { min: "start" } },
  },
];
const messages = {
  "rules.company_required": "Company is required",
  "rules.end_after_start": "End must not be before {min}",
};

// Signal Forms need an injection context. Without a DOM (vitest "node"
// environment) a minimal fake `document` stands in for DOCUMENT.
const el = () => ({
  appendChild() {},
  setAttribute() {},
  remove() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  style: {},
  addEventListener() {},
  removeEventListener() {},
});
const fakeDoc = {
  ...el(),
  createElement: el,
  getElementById: () => null,
  body: el(),
  head: el(),
  documentElement: el(),
};

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DOCUMENT, useValue: fakeDoc },
    ],
  });
});

const msgs = (errs: { message?: string }[]) => errs.map((e) => e.message);

describe("Signal Forms + validateStandardSchema + withRules", () => {
  const Schema = z.object({
    plan: z.string(),
    company: z.string(),
    start: z.string(),
    end: z.string(),
  });
  const make = () => {
    const model = signal({ plan: "free", company: "", start: "", end: "" });
    const f = form(
      model,
      (p) => validateStandardSchema(p, withRules(Schema, rules, { messages })),
      { injector: TestBed.inject(Injector) },
    );
    return { model, f };
  };

  it("required_when error appears and clears when only plan changes", () => {
    const { model, f } = make();
    expect(f.company().errors()).toEqual([]);
    model.update((m) => ({ ...m, plan: "pro" }));
    expect(msgs(f.company().errors())).toEqual(["Company is required"]);
    model.update((m) => ({ ...m, plan: "free" }));
    expect(f.company().errors()).toEqual([]);
  });

  it("compare error follows start", () => {
    const { model, f } = make();
    model.update((m) => ({ ...m, start: "2026-05-10", end: "2026-05-01" }));
    expect(msgs(f.end().errors())).toEqual(["End must not be before start"]);
    model.update((m) => ({ ...m, start: "2026-04-01" }));
    expect(f.end().errors()).toEqual([]);
  });
});

describe("validonceGroupValidator (Reactive Forms)", () => {
  const make = () =>
    new FormGroup(
      {
        plan: new FormControl("free", { nonNullable: true }),
        company: new FormControl("", { nonNullable: true }),
        start: new FormControl(""),
        end: new FormControl(""),
      },
      { validators: validonceGroupValidator(rules, { messages }) },
    );

  it("sets and clears the error on the company control", () => {
    const g = make();
    expect(g.valid).toBe(true);
    g.controls.plan.setValue("pro");
    expect(g.controls.company.errors).toEqual({
      validonce: {
        ruleId: "Signup.required_when.company",
        key: "rules.company_required",
        params: {},
        message: "Company is required",
      },
    });
    expect(g.controls.plan.errors).toBeNull();
    expect(g.errors?.validonce).toHaveLength(1);
    expect(g.invalid).toBe(true);
    g.controls.plan.setValue("free");
    expect(g.controls.company.errors).toBeNull();
    expect(g.errors).toBeNull();
    expect(g.valid).toBe(true);
  });

  it("keeps other errors on the control and removes only validonce", () => {
    const g = new FormGroup(
      {
        plan: new FormControl("pro"),
        company: new FormControl("", [Validators.minLength(3)]),
      },
      { validators: validonceGroupValidator(rules) },
    );
    g.controls.company.setErrors({ other: true });
    g.updateValueAndValidity();
    expect(Object.keys(g.controls.company.errors ?? {}).sort()).toEqual([
      "other",
      "validonce",
    ]);
    g.controls.plan.setValue("free");
    expect(g.controls.company.errors).toEqual({ other: true });
  });

  it("compare: error on end when start changes", () => {
    const g = make();
    g.patchValue({ start: "2026-05-10", end: "2026-05-01" });
    expect(g.controls.end.errors?.validonce.message).toBe(
      "End must not be before start",
    );
    g.controls.start.setValue("2026-04-01");
    expect(g.controls.end.errors).toBeNull();
  });

  it("ignores paths with no control and resolves nested paths", () => {
    const orphan: Rule[] = [
      {
        id: "x",
        kind: "at_least_one_of",
        fields: ["nope", "b"],
        message: { key: "k" },
      },
    ];
    const g = new FormGroup(
      { b: new FormControl("") },
      { validators: validonceGroupValidator(orphan) },
    );
    expect(g.errors?.validonce).toHaveLength(1);
    expect(g.controls.b.errors).toBeNull();
    const inner = new FormGroup(
      { company: new FormControl(""), plan: new FormControl("pro") },
      { validators: validonceGroupValidator(rules) },
    );
    const outer = new FormGroup({ inner });
    expect(inner.controls.company.errors?.validonce.key).toBe(
      "rules.company_required",
    );
    expect(outer.invalid).toBe(true);
  });
});
