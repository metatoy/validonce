// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Signup cross-field rules as a Joi schema (no validonce).
// Only the migrated rules: field-level checks (enum, required) would show as divergences.
import Joi from "joi";

export const Signup = Joi.object({
  plan: Joi.any(),
  company: Joi.when("plan", { is: "pro", then: Joi.string().required(), otherwise: Joi.any() }),
  email: Joi.any(),
  start: Joi.any(),
  end: Joi.string()
    .allow(null, "")
    .custom((v, helpers) => {
      const start = helpers.state.ancestors[0].start;
      return !start || v >= start ? v : helpers.error("any.invalid");
    }),
  quantity: Joi.number().min(1),
});
