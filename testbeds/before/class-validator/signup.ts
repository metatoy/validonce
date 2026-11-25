// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Signup cross-field rules as a class-validator DTO (no validonce).
import { IsNotEmpty, Min, Validate, ValidateIf } from "class-validator";
import { OnOrAfter, present } from "./common";

export class Signup {
  plan!: string;
  @ValidateIf((o: Signup) => o.plan === "pro")
  @IsNotEmpty()
  company?: string | null;
  email!: string;
  start!: string;
  @ValidateIf((o: Signup) => present(o.end) && present(o.start))
  @Validate(OnOrAfter, ["start"])
  end?: string | null;
  @Min(1)
  quantity!: number;
}
