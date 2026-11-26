// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Sign-up form. Dates are YYYY-MM-DD.
import { FormControl, FormGroup, Validators } from "@angular/forms";

// A real calendar day, as YYYY-MM-DD text.
const isDay = (v) => {
  if (typeof v !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v;
};
const day = (c) => (!c.value || isDay(c.value) ? null : { day: true });

function signupRules(group) {
  const v = group.value;
  const setErr = (name, key) => {
    const c = group.get(name);
    c.setErrors({ ...(c.errors ?? {}), [key]: true });
  };
  if (v.plan === "pro" && !v.company) setErr("company", "required");
  if (v.end && v.end < v.start) setErr("end", "endBeforeStart");
  if (v.quantity < 1) setErr("quantity", "min");
  return null;
}

// Template contract: export a factory returning a fresh FormGroup with every
// control and the group validator attached.
export function buildSignupGroup() {
  return new FormGroup(
    {
      plan: new FormControl(null, Validators.required),
      company: new FormControl(null),
      email: new FormControl(null, Validators.required),
      start: new FormControl(null, [Validators.required, day]),
      end: new FormControl(null, day),
      quantity: new FormControl(null, Validators.required),
    },
    { validators: signupRules },
  );
}
