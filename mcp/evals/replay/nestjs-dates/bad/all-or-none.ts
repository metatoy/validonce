// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { ValidatorConstraint, type ValidatorConstraintInterface } from "class-validator";

export const filled = (v: unknown) => v !== undefined && v !== null && v !== "";

/** A real calendar day, as YYYY-MM-DD text. */
@ValidatorConstraint({ name: "isDay" })
export class IsDay implements ValidatorConstraintInterface {
  validate(v: unknown) {
    if (typeof v !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const t = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v;
  }
  defaultMessage() {
    return "Enter a date as YYYY-MM-DD";
  }
}
