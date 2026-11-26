---
max_turns: 15
timeout_seconds: 400
tags: [classify, frontend, react]
allowed_tools: [Read, Glob, Grep, Skill]
---

Our React signup form has these Zod checks, and the API repeats them by hand. We want to define them once on the server with validonce and have the form read them. Which can move and which can't? Draft the rules for the ones that move. Don't run or install anything, just answer here.

```ts
import { z } from "zod";

export const signupSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string(),
    country: z.string(),
    age: z.number().int().optional(),
    startDate: z.string().optional(), // YYYY-MM-DD
    endDate: z.string().optional(),   // YYYY-MM-DD
  })
  .superRefine((v, ctx) => {
    if (v.confirmPassword !== v.password) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords must match" });
    }
    if (v.startDate && v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End must be on or after start" });
    }
    if (v.country === "US" && v.age !== undefined && v.age < 21) {
      ctx.addIssue({ code: "custom", path: ["age"], message: "You must be 21 or over in the US" });
    }
  });
```
