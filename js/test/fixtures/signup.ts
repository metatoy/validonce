// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { defineRules, fieldRefs, when } from "../../src/rules";

export const signupFields = [
  "plan",
  "company",
  "email",
  "start",
  "end",
  "quantity",
] as const;

const F = fieldRefs(...signupFields);

export const signupRules = defineRules(
  "Signup",
  [
    when(F.plan.eq("pro")).require(F.company, {
      key: "rules.company_required",
      id: "Signup.required_when.company",
    }),
    F.end.ge(F.start, {
      key: "rules.end_after_start",
      id: "Signup.compare.end",
      type: "date",
    }),
    F.quantity.ge(1, {
      key: "rules.quantity_min",
      params: { min: 1 },
      id: "Signup.compare.quantity",
      type: "number",
    }),
  ],
  { fields: signupFields },
);
