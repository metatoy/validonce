// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Order totals schema.
import { z } from "zod";

export const Order = z
  .object({
    subtotal: z.number(),
    tax: z.number(),
    total: z.number(),
  })
  .superRefine((v, ctx) => {
    if (v.subtotal + v.tax !== v.total) {
      ctx.addIssue({ code: "custom", path: ["total"], message: "Total must equal subtotal plus tax" });
    }
  });

export type Order = z.infer<typeof Order>;
