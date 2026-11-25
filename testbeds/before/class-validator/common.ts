// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from "class-validator";

// validonce blank: missing, null, "" or []. A single space is NOT blank.
export const present = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);

@ValidatorConstraint({ name: "onOrAfter" })
export class OnOrAfter implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    const other = (args.object as Record<string, unknown>)[args.constraints[0]];
    if (!present(value) || !present(other)) return true;
    return value >= (other as string);
  }
  defaultMessage() { return "must be on or after the other date"; }
}

@ValidatorConstraint({ name: "allOrNone" })
export class AllOrNone implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    const o = args.object as Record<string, unknown>;
    const all = [value, ...args.constraints.map((f: string) => o[f])].map(present);
    return all.every(Boolean) || !all.some(Boolean);
  }
  defaultMessage() { return "fill in all of these fields or none"; }
}
