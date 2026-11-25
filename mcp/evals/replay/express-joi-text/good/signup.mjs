// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Request schema of POST /signups. Dates are YYYY-MM-DD.
import Joi from "joi";
import { defineRules, fieldRefs, when } from "validonce/rules";

const fields = ["plan", "company", "email", "confirmEmail", "start", "end", "quantity"];
const F = fieldRefs(...fields);

export const signupRules = defineRules(
  "Signup",
  [
    when(F.plan.eq("pro")).require(F.company, { key: "rules.company_required" }),
    F.confirmEmail.equals(F.email, { key: "rules.email_match", type: "string" }),
    F.end.ge(F.start, { key: "rules.end_after_start", type: "date" }),
  ],
  { fields },
);

// A real calendar day, as YYYY-MM-DD text.
const day = Joi.string()
  .pattern(/^(?!0000)\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .custom((v, helpers) => {
    const t = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v ? v : helpers.error("any.invalid");
  });

export const Signup = Joi.object({
  plan: Joi.string().valid("free", "pro").required(),
  company: Joi.string().allow(null, ""),
  email: Joi.string().required(),
  confirmEmail: Joi.string().required(),
  start: day.required(),
  end: day.allow(null),
  quantity: Joi.number().integer().min(1).required(),
});
