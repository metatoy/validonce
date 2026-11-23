// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Signup rules as a hand-written yup schema (no validonce).
import * as yup from "yup";

export const Signup = yup.object({
  plan: yup.string().oneOf(["free", "pro"]).required(),
  company: yup
    .string()
    .nullable()
    .when("plan", { is: "pro", then: (s) => s.required("Company is required") }),
  email: yup.string().required(),
  start: yup.string().required(),
  end: yup
    .string()
    .nullable()
    .test("end-after-start", "End must not be before start", function (end) {
      if (!end) return true;
      return end >= this.parent.start;
    }),
  quantity: yup.number().integer().required().min(1, "Quantity must be at least 1"),
});
