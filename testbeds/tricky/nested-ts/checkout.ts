// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Checkout form schema.
import { z } from "zod";

export const Checkout = z
  .object({
    email: z.string().min(1),
    poNumber: z.string().nullish(),
    billing: z.object({
      business: z.boolean(),
      vatId: z.string().nullish(),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.billing.business && !v.poNumber) {
      ctx.addIssue({ code: "custom", path: ["poNumber"], message: "A purchase order number is required for business billing" });
    }
  });

export type Checkout = z.infer<typeof Checkout>;
