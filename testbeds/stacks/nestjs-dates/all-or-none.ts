// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { type ValidationArguments, ValidatorConstraint, type ValidatorConstraintInterface } from "class-validator";

export const filled = (v: unknown) => v !== undefined && v !== null && v !== "";

@ValidatorConstraint({ name: "allOrNone" })
export class AllOrNone implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    const o = args.object as Record<string, unknown>;
    const set = [value, ...args.constraints.map((f: string) => o[f])].map(filled);
    return set.every(Boolean) || !set.some(Boolean);
  }
  defaultMessage() {
    return "Fill in street, city and postal code together";
  }
}

@ValidatorConstraint({ name: "onOrAfter" })
export class OnOrAfter implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    const from = (args.object as Record<string, unknown>)[args.constraints[0]];
    return !filled(from) || value >= (from as string);
  }
  defaultMessage() {
    return "Available to must be on or after available from";
  }
}

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
