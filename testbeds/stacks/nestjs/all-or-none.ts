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
    return value >= ((args.object as Record<string, unknown>)[args.constraints[0]] as string);
  }
  defaultMessage() {
    return "Available to must be on or after available from";
  }
}
