// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

/** NestJS app enforcing the shared Signup rules (same contract as the other example backends). */
import "reflect-metadata";
import {
  type ArgumentMetadata,
  Body,
  Controller,
  Module,
  type PipeTransform,
  Post,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ApiBody, ApiProperty, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  registerDecorator,
} from "class-validator";
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

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in YYYY-MM-DD form: 2026-02-30 and 2026-13-01 are rejected. */
function isCalendarDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const m = DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  t.setUTCFullYear(y); // years 0000-0099 would otherwise map to 1900-1999
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function IsCalendarDate() {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: "isCalendarDate",
      target: target.constructor,
      propertyName,
      validator: {
        validate: isCalendarDate,
        defaultMessage: () => "$property must be a calendar date (YYYY-MM-DD)",
      },
    });
}

// Field checks (class-validator) answer 400 the usual Nest way; the rules answer 422.
// esbuild emits no decorator metadata, so each property states its type for @nestjs/swagger.
@ValidonceRules(signupRules)
export class Signup {
  @ApiProperty({ type: String, enum: ["free", "pro"] })
  @IsIn(["free", "pro"])
  plan!: "free" | "pro";

  @ApiProperty({ type: String, nullable: true, required: false })
  @IsOptional()
  @IsString()
  company?: string | null;

  @ApiProperty({ type: String, minLength: 1 })
  @IsString()
  @MinLength(1)
  email!: string;

  @ApiProperty({ type: String, format: "date" })
  @IsCalendarDate()
  start!: string;

  @ApiProperty({ type: String, format: "date", nullable: true, required: false })
  @IsOptional()
  @IsCalendarDate()
  end?: string | null;

  @ApiProperty({ type: "integer", format: "int32" })
  @IsInt()
  quantity!: number;
}

/** Runs Nest's ValidationPipe against `Signup` (no emitted metadata to find the class from). */
class SignupFieldsPipe implements PipeTransform {
  private readonly pipe = new ValidationPipe();
  transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    return this.pipe.transform(value, { ...metadata, metatype: Signup });
  }
}

@Controller("signups")
class SignupsController {
  @Post()
  @ApiBody({ type: Signup })
  create(@Body(new SignupFieldsPipe(), new ValidonceValidationPipe(Signup)) _body: Signup): { ok: boolean } {
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
