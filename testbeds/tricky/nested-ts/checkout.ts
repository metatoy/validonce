// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Tricky fixture: a rule on a nested object (billing.vatId depends on billing.business).
// validonce rules address top-level fields only, so the agent must keep this.
import { z } from "zod";

export const Checkout = z
  .object({
    email: z.string().min(1),
    billing: z.object({
      business: z.boolean(),
      vatId: z.string().nullish(),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.billing.business && !v.billing.vatId) {
      ctx.addIssue({ code: "custom", path: ["billing", "vatId"], message: "VAT id is required for businesses" });
    }
  });

export type Checkout = z.infer<typeof Checkout>;
