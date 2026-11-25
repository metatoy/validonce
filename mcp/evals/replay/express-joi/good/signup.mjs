// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Request schema of POST /signups.
import Joi from "joi";
import { defineRules, fieldRefs, when } from "validonce/rules";

const fields = ["plan", "company", "email", "start", "end", "quantity"];
const F = fieldRefs(...fields);

export const signupRules = defineRules(
  "Signup",
  [
    when(F.plan.eq("pro")).require(F.company, { key: "rules.company_required" }),
    F.end.ge(F.start, { key: "rules.end_after_start", type: "date" }),
  ],
  { fields },
);

export const Signup = Joi.object({
  plan: Joi.string().valid("free", "pro").required(),
  company: Joi.string().allow(null, ""),
  email: Joi.string().required(),
  start: Joi.date().iso().required(),
  end: Joi.date().iso().allow(null),
  quantity: Joi.number().integer().min(1).required(),
});
