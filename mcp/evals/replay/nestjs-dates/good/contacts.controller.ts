// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { Body, Controller, Post, ValidationPipe } from "@nestjs/common";
import { ApiBody } from "@nestjs/swagger";
import { ValidonceValidationPipe } from "validonce/nestjs";
import { Contact } from "./contact.dto";

@Controller("contacts")
export class ContactsController {
  @Post()
  @ApiBody({ type: Contact })
  create(@Body(new ValidationPipe({ transform: true, expectedType: Contact }), new ValidonceValidationPipe(Contact)) body: Contact) {
    return { ok: true };
  }
}
