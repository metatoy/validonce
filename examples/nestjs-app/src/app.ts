// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

/** NestJS app enforcing the shared Signup rules (same contract as the other example backends). */
import "reflect-metadata";
import { Body, Controller, Module, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ApiBody, ApiProperty, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { defineRules, fieldRefs, when } from "validonce/rules";
import {
  addValidonceToDocument,
  ValidonceExceptionFilter,
  ValidonceRules,
  ValidonceValidationPipe,
} from "validonce/nestjs";

const signupFields = ["plan", "company", "email", "start", "end", "quantity"] as const;
const F = fieldRefs(...signupFields);

// Built once at startup: an unknown field or an id collision stops the app here.
const signupRules = defineRules(
  "Signup",
  [
    when(F.plan.eq("pro")).require(F.company, {
      key: "rules.company_required",
      id: "Signup.required_when.company",
    }),
    F.end.ge(F.start, {
      key: "rules.end_after_start",
      id: "Signup.compare.end",
      type: "date",
    }),
    F.quantity.ge(1, {
      key: "rules.quantity_min",
      params: { min: 1 },
      id: "Signup.compare.quantity",
      type: "number",
    }),
  ],
  { fields: signupFields },
);

// esbuild emits no decorator metadata, so each property states its type for @nestjs/swagger.
@ValidonceRules(signupRules)
export class Signup {
  @ApiProperty({ type: String, enum: ["free", "pro"] })
  plan!: "free" | "pro";

  @ApiProperty({ type: String, nullable: true, required: false })
  company?: string | null;

  @ApiProperty({ type: String, minLength: 1 })
  email!: string;

  @ApiProperty({ type: String, format: "date" })
  start!: string;

  @ApiProperty({ type: String, format: "date", nullable: true, required: false })
  end?: string | null;

  @ApiProperty({ type: Number, format: "int32" })
  quantity!: number;
}

@Controller("signups")
class SignupsController {
  @Post()
  @ApiBody({ type: Signup })
  create(@Body(new ValidonceValidationPipe(Signup)) _body: Signup): { ok: boolean } {
    return { ok: true };
  }
}

@Module({ controllers: [SignupsController] })
class AppModule {}

export async function buildApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.enableCors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4200",
      "http://127.0.0.1:4200",
    ],
    methods: ["GET", "POST"],
  });
  app.useGlobalFilters(new ValidonceExceptionFilter());

  const document = addValidonceToDocument(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("validonce NestJS example")
        .setVersion("0.1.0")
        .build(),
    ),
    [Signup],
  );
  // Same-origin path the React form reads (`/openapi.json`).
  app.getHttpAdapter().get("/openapi.json", (_req: unknown, res: { json(b: unknown): void }) => {
    res.json(document);
  });
  await app.init();
  return { app, document };
}
