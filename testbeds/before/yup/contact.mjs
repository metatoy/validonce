// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Contact cross-field rules as a yup schema (the form-level check VeeValidate runs through yup).
import * as yup from "yup";

const present = (v) => v !== undefined && v !== null && v !== "";

export const Contact = yup.object({
  email: yup.string().nullable().test("email-or-phone", "Enter an email or a phone number", function (v) {
    return present(v) || present(this.parent.phone);
  }),
  phone: yup.string().nullable(),
  street: yup.string().nullable().test("address", "Fill in street, city and postal code together", function (v) {
    const p = [v, this.parent.city, this.parent.postalCode].map(present);
    return p.every(Boolean) || !p.some(Boolean);
  }),
  city: yup.string().nullable(),
  postalCode: yup.string().nullable().when("country", { is: "US", then: (s) => s.test("us-postal", "Postal code is required in the US", present) }),
  country: yup.string().nullable(),
  availableFrom: yup.string().nullable(),
  availableTo: yup.string().nullable().test("to-after-from", "Available to must be on or after available from", function (v) {
    return !present(v) || !present(this.parent.availableFrom) || v >= this.parent.availableFrom;
  }),
});
