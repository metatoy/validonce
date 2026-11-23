// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Signup rules as an Angular Reactive Forms group validator (no validonce).
import { FormControl, FormGroup, Validators } from "@angular/forms";

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
      start: new FormControl(null, Validators.required),
      end: new FormControl(null),
      quantity: new FormControl(null, Validators.required),
    },
    { validators: signupRules },
  );
}
