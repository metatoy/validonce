// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { allOrNone, atLeastOneOf, defineRules, fieldRefs, when } from "validonce/rules";
import { ValidonceRules } from "validonce/nestjs";

const fields = ["email", "phone", "street", "city", "postalCode", "country", "availableFrom", "availableTo"] as const;
const F = fieldRefs(...fields);

export const contactRules = defineRules(
  "Contact",
  [
    atLeastOneOf(F.email, F.phone, { key: "rules.contact_email_or_phone" }),
    allOrNone(F.street, F.city, F.postalCode, { key: "rules.address_all_or_none" }),
    when(F.country.eq("US")).require(F.postalCode, { key: "rules.postal_code_required_us" }),
    F.availableTo.gt(F.availableFrom, { key: "rules.available_to_after_from", type: "date" }),
  ],
  { fields },
);

@ValidonceRules(contactRules)
export class Contact {
  @ApiProperty({ type: String, nullable: true, required: false }) email?: string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) phone?: string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) street?: string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) city?: string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) postalCode?: string | null;

  @ApiProperty({ enum: ["US", "CA", "GB", "other"] })
  @IsIn(["US", "CA", "GB", "other"])
  country!: string;

  @ApiProperty({ type: String, format: "date", nullable: true, required: false }) availableFrom?: string | null;
  @ApiProperty({ type: String, format: "date", nullable: true, required: false }) availableTo?: string | null;
}
