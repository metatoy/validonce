// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import "reflect-metadata";
import { Body, Controller, Module, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  ApiBody,
  ApiProperty,
  DocumentBuilder,
  SwaggerModule,
} from "@nestjs/swagger";
import { describe, expect, it } from "vitest";
import {
  addValidonceToDocument,
  rulesOf,
  ValidonceException,
  ValidonceExceptionFilter,
  ValidonceRules,
  ValidonceValidationPipe,
} from "../src/nestjs";
import { issuesFromProblemDetails } from "../src/server-errors";
import { signupRules } from "./fixtures/signup";

@ValidonceRules(signupRules)
class Signup {
  @ApiProperty({ type: String, enum: ["free", "pro"] })
  plan!: string;
  @ApiProperty({ type: String, nullable: true, required: false })
  company?: string | null;
  @ApiProperty({ type: String, minLength: 1 })
  email!: string;
  @ApiProperty({ type: String, format: "date" })
  start!: string;
  @ApiProperty({
    type: String,
    format: "date",
    nullable: true,
    required: false,
  })
  end?: string | null;
  @ApiProperty({ type: Number })
  quantity!: number;
}

class Plain {
  @ApiProperty({ type: String })
  x!: string;
}

@Controller()
class SignupsController {
  @Post("signups")
  @ApiBody({ type: Signup })
  create(@Body(new ValidonceValidationPipe(Signup)) _body: Signup): {
    ok: boolean;
  } {
    return { ok: true };
  }
  @Post("plain")
  @ApiBody({ type: Plain })
  plain(@Body() _body: Plain): { ok: boolean } {
    return { ok: true };
  }
}

@Module({ controllers: [SignupsController] })
class AppModule {}

async function start() {
  const app = await NestFactory.create(AppModule, { logger: false });
  // biome-ignore lint/correctness/useHookAtTopLevel: Nest API, not a React hook
  app.useGlobalFilters(new ValidonceExceptionFilter());
  await app.listen(0, "127.0.0.1");
  const url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  return { app, url };
}

const ok = {
  plan: "free",
  company: null,
  email: "a@example.test",
  start: "2026-03-10",
  end: null,
  quantity: 1,
};

async function post(url: string, path: string, body: unknown) {
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, body: (await res.json()) as unknown };
}

describe("validonce/nestjs", () => {
  it("passes a valid body and unannotated classes", async () => {
    const { app, url } = await start();
    try {
      expect((await post(url, "/signups", ok)).res.status).toBe(201);
      expect((await post(url, "/plain", { x: "y" })).res.status).toBe(201);
    } finally {
      await app.close();
    }
  });

  it("returns 422 problem details with every failing rule", async () => {
    const { app, url } = await start();
    try {
      const { res, body } = await post(url, "/signups", {
        ...ok,
        plan: "pro",
        end: "2026-03-01",
        quantity: 0,
      });
      expect(res.status).toBe(422);
      expect(res.headers.get("content-type")).toContain(
        "application/problem+json",
      );
      expect(body).toMatchObject({ type: "about:blank", status: 422 });
      expect(issuesFromProblemDetails(body).map((i) => i.ruleId)).toEqual([
        "Signup.required_when.company",
        "Signup.compare.end",
        "Signup.compare.quantity",
      ]);
    } finally {
      await app.close();
    }
  });

  it("adds x-validonce to the component schema", async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    addValidonceToDocument(doc, [Signup]);
    expect(
      (
        doc.components?.schemas?.Signup as Record<string, unknown> | undefined
      )?.["x-validonce"],
    ).toEqual(signupRules);
    expect(rulesOf(Signup)).toEqual(signupRules);
    expect(() => addValidonceToDocument(doc, [Plain])).toThrow(
      /no @ValidonceRules/,
    );
    await app.close();
  });

  it("reads the class from Nest's metadata when no target is given", () => {
    const pipe = new ValidonceValidationPipe();
    const bad = { ...ok, plan: "pro" };
    expect(() =>
      pipe.transform(bad, { type: "body", metatype: Signup }),
    ).toThrow(ValidonceException);
    expect(pipe.transform(bad, { type: "body", metatype: Plain })).toBe(bad);
    expect(pipe.transform(bad, { type: "query", metatype: Signup })).toBe(bad);
    expect(pipe.transform("x", { type: "body", metatype: Signup })).toBe("x");
  });

  it("fails at startup when the class has no schema in the document", () => {
    @ValidonceRules(signupRules)
    class Orphan {}
    expect(() =>
      addValidonceToDocument({ components: { schemas: {} } }, [Orphan]),
    ).toThrow(/no schema in the OpenAPI document/);
  });
});
