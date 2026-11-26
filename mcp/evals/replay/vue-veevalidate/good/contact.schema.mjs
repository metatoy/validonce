// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Form schema of ContactForm.vue.
import { withRules } from "validonce/zod";
import { z } from "zod";
import rules from "./validonce-rules.json" with { type: "json" };

const text = z.string().nullish();
const base = z.object({
  email: text,
  phone: text,
  street: text,
  city: text,
  postalCode: text,
  country: z.enum(["US", "CA", "GB", "other"]),
  availableFrom: text,
  availableTo: text,
});

export { rules };
export const Contact = withRules(base, rules);
