---
max_turns: 15
timeout_seconds: 400
tags: [classify, frontend, angular]
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Angular checkout form has these group validators, and our backend repeats them by hand. We want to define them once on the server with validonce. Which can move and which can't? Draft the rules for the ones that move. Don't run or install anything, just answer here.

```ts
import { AbstractControl, AsyncValidatorFn, ValidationErrors, ValidatorFn } from "@angular/forms";
import { map } from "rxjs";

const blank = (v: unknown) => v === null || v === undefined || v === "";

export const contactRequired: ValidatorFn = (g: AbstractControl): ValidationErrors | null =>
  blank(g.get("email")?.value) && blank(g.get("phone")?.value) ? { contactRequired: true } : null;

export const onePaymentMethod: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const filled = ["cardNumber", "invoiceRef"].filter((k) => !blank(g.get(k)?.value)).length;
  return filled === 1 ? null : { onePaymentMethod: true };
};

export const couponValid = (api: CouponApi): AsyncValidatorFn => (g: AbstractControl) =>
  api.check(g.get("coupon")?.value).pipe(map((ok) => (ok ? null : { couponInvalid: true })));
```
