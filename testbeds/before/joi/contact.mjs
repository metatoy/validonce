// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Contact cross-field rules as a Joi schema (no validonce).
import Joi from "joi";

const nonBlank = Joi.string().min(1).required();
const FAIL = Joi.any().valid("never").required();
const BLANK = Joi.any().valid(null, "");

export const Contact = Joi.object({
  email: Joi.when("phone", { is: nonBlank, then: Joi.any(), otherwise: nonBlank }),
  phone: Joi.any(),
  // all-or-none: all three non-blank, or all three blank
  street: Joi.when("city", {
    is: nonBlank,
    then: Joi.when("postalCode", { is: nonBlank, then: nonBlank, otherwise: FAIL }),
    otherwise: Joi.when("postalCode", { is: nonBlank, then: FAIL, otherwise: BLANK }),
  }),
  city: Joi.any(),
  postalCode: Joi.when("country", { is: "US", then: nonBlank, otherwise: Joi.any() }),
  country: Joi.any(),
  availableFrom: Joi.any(),
  availableTo: Joi.string()
    .allow(null, "")
    .custom((v, helpers) => {
      const from = helpers.state.ancestors[0].availableFrom;
      return !from || v >= from ? v : helpers.error("any.invalid");
    }),
});
