// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Signup rules as a hand-written Zod schema (no validonce).
import { z } from "zod";

export const Signup = z
  .object({
    plan: z.enum(["free", "pro"]),
    company: z.string().nullish(),
    email: z.string().min(1),
    start: z.iso.date(),
    end: z.iso.date().nullish(),
    quantity: z.number().int(),
  })
  .superRefine((v, ctx) => {
    if (v.plan === "pro" && !v.company) {
      ctx.addIssue({ code: "custom", path: ["company"], message: "Company is required" });
    }
    if (v.end && v.end < v.start) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "End must not be before start" });
    }
    if (v.quantity < 1) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantity must be at least 1" });
    }
  });
