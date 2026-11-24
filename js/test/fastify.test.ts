// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import swagger from "@fastify/swagger";
import { Type } from "@sinclair/typebox";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  ajvKeywords,
  rulesOf,
  swaggerRefResolver,
  validonceHook,
  withRules,
} from "../src/fastify";
import { issuesFromProblemDetails } from "../src/server-errors";
import { signupRules } from "./fixtures/signup";

const Signup = withRules(
  Type.Object(
    {
      plan: Type.Union([Type.Literal("free"), Type.Literal("pro")]),
      company: Type.Union([Type.String(), Type.Null()]),
      email: Type.String({ minLength: 1 }),
      start: Type.String({ format: "date" }),
      end: Type.Union([Type.String({ format: "date" }), Type.Null()]),
      quantity: Type.Integer(),
    },
    { $id: "Signup" },
  ),
  signupRules,
);

async function build() {
  const app = Fastify({ ajv: { customOptions: { keywords: ajvKeywords } } });
  await app.register(swagger, {
    openapi: { openapi: "3.1.0", info: { title: "t", version: "1" } },
    refResolver: swaggerRefResolver,
  });
  app.addSchema(Signup);
  app.post(
    "/signups",
    {
      schema: { body: { $ref: "Signup#" } },
      preHandler: validonceHook(Signup),
    },
    async () => ({ ok: true }),
  );
  await app.ready();
  return app;
}

const ok = {
  plan: "free",
  company: null,
  email: "a@example.test",
  start: "2026-03-10",
  end: null,
  quantity: 1,
};

describe("validonce/fastify", () => {
  it("accepts a valid body", async () => {
    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: "/signups",
      payload: ok,
    });
    expect(res.statusCode).toBe(200);
  });

  it("replies 422 problem details listing every failing rule", async () => {
    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: "/signups",
      payload: { ...ok, plan: "pro", end: "2026-03-01", quantity: 0 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json();
    expect(body).toMatchObject({ type: "about:blank", status: 422 });
    expect(issuesFromProblemDetails(body).map((i) => i.ruleId)).toEqual([
      "Signup.required_when.company",
      "Signup.compare.end",
      "Signup.compare.quantity",
    ]);
  });

  it("leaves field errors to Fastify's own validation", async () => {
    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: "/signups",
      payload: { ...ok, email: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("publishes x-validonce on the component schema", async () => {
    const app = await build();
    const doc = app.swagger() as {
      components: { schemas: Record<string, { "x-validonce"?: unknown }> };
    };
    expect(doc.components.schemas.Signup?.["x-validonce"]).toEqual(signupRules);
  });

  it("rulesOf reads them back; validonceHook rejects a bare schema", () => {
    expect(rulesOf(Signup)).toEqual(signupRules);
    expect(rulesOf({})).toBeUndefined();
    expect(() => validonceHook({})).toThrow(TypeError);
  });
});
