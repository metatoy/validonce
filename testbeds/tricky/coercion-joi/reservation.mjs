// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Request schema of POST /reservations.
import Joi from "joi";

export const Reservation = Joi.object({
  code: Joi.alternatives(Joi.string(), Joi.number()).required(),
  confirmCode: Joi.alternatives(Joi.string(), Joi.number())
    .required()
    .custom((value, helpers) => {
      const { code } = helpers.state.ancestors[0];
      return String(value).trim().toLowerCase() === String(code).trim().toLowerCase() ? value : helpers.error("any.only");
    }),
  seats: Joi.string().required(),
  children: Joi.string()
    .required()
    .custom((value, helpers) => (Number.parseInt(value, 10) <= Number.parseInt(helpers.state.ancestors[0].seats, 10) ? value : helpers.error("number.max"))),
});
