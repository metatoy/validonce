// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Contact cross-field rules as a class-validator DTO (no validonce).
import { IsNotEmpty, Validate, ValidateIf } from "class-validator";
import { AllOrNone, OnOrAfter, present } from "./common";

export class Contact {
  @ValidateIf((o: Contact) => !present(o.phone))
  @IsNotEmpty()
  email?: string | null;
  phone?: string | null;
  @Validate(AllOrNone, ["city", "postalCode"])
  street?: string | null;
  city?: string | null;
  @ValidateIf((o: Contact) => o.country === "US")
  @IsNotEmpty()
  postalCode?: string | null;
  country!: string;
  availableFrom?: string | null;
  @ValidateIf((o: Contact) => present(o.availableTo) && present(o.availableFrom))
  @Validate(OnOrAfter, ["availableFrom"])
  availableTo?: string | null;
}
