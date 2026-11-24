// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

/** Fastify app enforcing the shared Signup rules (same contract as the ASP.NET and FastAPI examples). */
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import { Type } from "@sinclair/typebox";
import Fastify from "fastify";
import { defineRules, fieldRefs, when } from "validonce/rules";
import {
  ajvKeywords,
  swaggerRefResolver,
  validonceHook,
  withRules,
} from "validonce/fastify";

const signupFields = ["plan", "company", "email", "start", "end", "quantity"] as const;
const F = fieldRefs(...signupFields);

// Built once at startup: an unknown field or an id collision stops the app here.
const rules = defineRules(
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

const Signup = withRules(
  Type.Object(
    {
      plan: Type.Union([Type.Literal("free"), Type.Literal("pro")]),
      company: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      email: Type.String({ minLength: 1 }),
      start: Type.String({ format: "date" }),
      end: Type.Optional(Type.Union([Type.String({ format: "date" }), Type.Null()])),
      quantity: Type.Integer(),
    },
    { $id: "Signup" },
  ),
  rules,
);

export async function buildApp() {
  const app = Fastify({ ajv: { customOptions: { keywords: ajvKeywords } } });
  await app.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4200",
      "http://127.0.0.1:4200",
    ],
    methods: ["GET", "POST"],
  });
  await app.register(swagger, {
    openapi: { openapi: "3.1.0", info: { title: "validonce Fastify example", version: "0.1.0" } },
    refResolver: swaggerRefResolver,
  });
  app.addSchema(Signup);

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
  app.post(
    "/signups",
    { schema: { body: { $ref: "Signup#" } }, preHandler: validonceHook(Signup) },
    async () => ({ ok: true }),
  );
  await app.ready();
  return app;
}
