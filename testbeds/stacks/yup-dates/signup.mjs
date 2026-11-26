// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Request schema of POST /signups. Dates are YYYY-MM-DD.
import * as yup from "yup";

// A real calendar day, as YYYY-MM-DD text.
const isDay = (v) => {
  if (typeof v !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v;
};

export const Signup = yup.object({
  plan: yup.string().oneOf(["free", "pro"]).required(),
  company: yup
    .string()
    .nullable()
    .when("plan", { is: "pro", then: (s) => s.required("Company is required") }),
  email: yup.string().required(),
  start: yup.string().required().test("day", "Enter a date", (v) => !v || isDay(v)),
  end: yup
    .string()
    .nullable()
    .test("day", "Enter a date", (v) => !v || isDay(v))
    .test("end-after-start", "End must not be before start", function (end) {
      if (!end) return true;
      return end >= this.parent.start;
    }),
  quantity: yup.number().integer().required().min(1, "Quantity must be at least 1"),
});
