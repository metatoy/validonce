// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Form schema of ContactForm.vue.
import * as yup from "yup";

const filled = (v) => v !== undefined && v !== null && v !== "";

export const Contact = yup.object({
  email: yup
    .string()
    .nullable()
    .test("email-or-phone", "Enter an email or a phone number", function (v) {
      return filled(v) || filled(this.parent.phone);
    }),
  phone: yup.string().nullable(),
  street: yup
    .string()
    .nullable()
    .test("address", "Fill in street, city and postal code together", function (v) {
      const set = [v, this.parent.city, this.parent.postalCode].map(filled);
      return set.every(Boolean) || !set.some(Boolean);
    }),
  city: yup.string().nullable(),
  postalCode: yup
    .string()
    .nullable()
    .when("country", { is: "US", then: (s) => s.required("Postal code is required in the US") }),
  country: yup.string().oneOf(["US", "CA", "GB", "other"]).required(),
  availableFrom: yup.string().nullable(),
  availableTo: yup
    .string()
    .nullable()
    .test("to-after-from", "Available to must be on or after available from", function (v) {
      return !filled(v) || !filled(this.parent.availableFrom) || v >= this.parent.availableFrom;
    }),
});
