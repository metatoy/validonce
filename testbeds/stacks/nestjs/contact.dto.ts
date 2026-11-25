// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, Validate, ValidateIf } from "class-validator";
import { AllOrNone, filled, OnOrAfter } from "./all-or-none";

export class Contact {
  @ApiProperty({ type: String, nullable: true, required: false })
  @ValidateIf((o: Contact) => !filled(o.phone))
  @IsNotEmpty({ message: "Enter an email or a phone number" })
  email?: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  phone?: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  @Validate(AllOrNone, ["city", "postalCode"])
  street?: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  city?: string | null;

  @ApiProperty({ type: String, nullable: true, required: false })
  @ValidateIf((o: Contact) => o.country === "US")
  @IsNotEmpty({ message: "Postal code is required in the US" })
  postalCode?: string | null;

  @ApiProperty({ enum: ["US", "CA", "GB", "other"] })
  @IsIn(["US", "CA", "GB", "other"])
  country!: string;

  @ApiProperty({ type: String, format: "date", nullable: true, required: false })
  availableFrom?: string | null;

  @ApiProperty({ type: String, format: "date", nullable: true, required: false })
  @ValidateIf((o: Contact) => filled(o.availableTo) && filled(o.availableFrom))
  @Validate(OnOrAfter, ["availableFrom"])
  availableTo?: string | null;
}
