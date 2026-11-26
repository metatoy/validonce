// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Request schema of POST /signups. Dates are YYYY-MM-DD.
import Joi from "joi";

// A real calendar day, as YYYY-MM-DD text.
const day = Joi.string()
  .pattern(/^(?!0000)\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .custom((v, helpers) => {
    const t = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v ? v : helpers.error("any.invalid");
  });

export const Signup = Joi.object({
  plan: Joi.string().valid("free", "pro").required(),
  company: Joi.when("plan", {
    is: "pro",
    then: Joi.string().required(),
    otherwise: Joi.string().allow(null, ""),
  }),
  email: Joi.string().required(),
  confirmEmail: Joi.string().valid(Joi.ref("email")).required(),
  start: day.required(),
  end: day.allow(null).custom((end, helpers) => {
    const { start } = helpers.state.ancestors[0];
    return end < start ? helpers.error("any.invalid") : end;
  }),
  quantity: Joi.number().integer().min(1).required(),
});
