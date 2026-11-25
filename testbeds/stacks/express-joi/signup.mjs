// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Request schema of POST /signups.
import Joi from "joi";

export const Signup = Joi.object({
  plan: Joi.string().valid("free", "pro").required(),
  company: Joi.when("plan", {
    is: "pro",
    then: Joi.string().required(),
    otherwise: Joi.string().allow(null, ""),
  }),
  email: Joi.string().required(),
  start: Joi.date().iso().required(),
  end: Joi.date().iso().min(Joi.ref("start")).allow(null),
  quantity: Joi.number().integer().min(1).required(),
});
