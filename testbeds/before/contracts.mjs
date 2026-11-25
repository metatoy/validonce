// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// The Signup and Contact contracts (examples/CONTRACT.md): rules + JSON Schema properties.
const str = { type: "string" };
const date = { type: "string", format: "date" };
export const contracts = {
  signup: {
    rules: [
      { id: "Signup.required_when.company", kind: "required_when", field: "company",
        when: { eq: { field: "plan", value: "pro" } }, message: { key: "rules.company_required" } },
      { id: "Signup.compare.end", kind: "compare", left: { field: "end" }, op: "ge",
        right: { field: "start" }, type: "date", message: { key: "rules.end_after_start" } },
      { id: "Signup.compare.quantity", kind: "compare", left: { field: "quantity" }, op: "ge",
        right: { value: 1 }, type: "number", message: { key: "rules.quantity_min", params: { min: 1 } } },
    ],
    properties: { plan: { type: "string", enum: ["free", "pro"] }, company: str, email: str, start: date, end: date, quantity: { type: "integer" } },
    required: ["plan", "email", "start", "quantity"],
  },
  contact: {
    rules: [
      { id: "Contact.at_least_one_of.email", kind: "at_least_one_of", fields: ["email", "phone"], message: { key: "rules.contact_email_or_phone" } },
      { id: "Contact.all_or_none.street", kind: "all_or_none", fields: ["street", "city", "postalCode"], message: { key: "rules.address_all_or_none" } },
      { id: "Contact.required_when.postalCode", kind: "required_when", field: "postalCode",
        when: { eq: { field: "country", value: "US" } }, message: { key: "rules.postal_code_required_us" } },
      { id: "Contact.compare.availableTo", kind: "compare", left: { field: "availableTo" }, op: "ge",
        right: { field: "availableFrom" }, type: "date", message: { key: "rules.available_to_after_from" } },
    ],
    properties: { email: str, phone: str, street: str, city: str, postalCode: str, country: { type: "string", enum: ["US", "CA", "GB", "other"] }, availableFrom: date, availableTo: date },
    required: ["country"],
  },
};
