// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { IsIn, IsOptional, Matches, ValidateIf } from "class-validator";

export class Address {
  @IsIn(["US", "CA"])
  country!: string;

  @IsOptional()
  @ValidateIf((o: Address) => o.country === "US")
  @Matches(/^\d{5}(-\d{4})?$/, { message: "Enter a US ZIP code" })
  postalCode?: string;

  @IsOptional()
  @ValidateIf((o: Address) => o.country === "CA")
  @Matches(/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/, { message: "Enter a Canadian postal code" })
  canadianPostalCode?: string;
}
