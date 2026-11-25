// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

/** Fastify app enforcing the shared Signup rules (same contract as the ASP.NET and FastAPI examples). */
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import { Type } from "@sinclair/typebox";
import Fastify from "fastify";
import { allOrNone, atLeastOneOf, defineRules, fieldRefs, when } from "validonce/rules";
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

const contactFields = [
  "email",
  "phone",
  "street",
  "city",
  "postalCode",
  "country",
  "availableFrom",
  "availableTo",
] as const;
const C = fieldRefs(...contactFields);

const contactRules = defineRules(
  "Contact",
  [
    atLeastOneOf(C.email, C.phone, { key: "rules.contact_email_or_phone" }),
    allOrNone(C.street, C.city, C.postalCode, { key: "rules.address_all_or_none" }),
    when(C.country.eq("US")).require(C.postalCode, { key: "rules.postal_code_required_us" }),
    C.availableTo.ge(C.availableFrom, {
      key: "rules.available_to_after_from",
      type: "date",
    }),
  ],
  { fields: contactFields },
);

const optionalString = (opts = {}) => Type.Optional(Type.Union([Type.String(opts), Type.Null()]));

const Contact = withRules(
  Type.Object(
    {
      email: optionalString({ format: "email" }),
      phone: optionalString({ pattern: "^\\+?[0-9 ()-]{7,20}$" }),
      street: optionalString(),
      city: optionalString(),
      postalCode: optionalString(),
      country: Type.Union([
        Type.Literal("US"),
        Type.Literal("CA"),
        Type.Literal("GB"),
        Type.Literal("other"),
      ]),
      availableFrom: optionalString({ format: "date" }),
      availableTo: optionalString({ format: "date" }),
    },
    { $id: "Contact" },
  ),
  contactRules,
);

/** Contact bodies are tiny; anything over 16 KB is rejected with 413. */
export const BODY_LIMIT = 16 * 1024;

export async function buildApp() {
  const app = Fastify({
    ajv: { customOptions: { keywords: ajvKeywords } },
    bodyLimit: BODY_LIMIT,
    logger: false, // never log request bodies
  });
  await app.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4200",
      "http://127.0.0.1:4200",
      "https://playground.metatoy.com",
      "http://localhost:5180",
    ],
    methods: ["GET", "POST"],
  });
  await app.register(swagger, {
    openapi: { openapi: "3.1.0", info: { title: "validonce Fastify example", version: "0.1.0" } },
    refResolver: swaggerRefResolver,
  });
  app.addSchema(Signup);
  app.addSchema(Contact);

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
  app.post(
    "/signups",
    { schema: { body: { $ref: "Signup#" } }, preHandler: validonceHook(Signup) },
    async () => ({ ok: true }),
  );
  app.post(
    "/contacts",
    { schema: { body: { $ref: "Contact#" } }, preHandler: validonceHook(Contact) },
    async () => ({ ok: true }),
  );
  app.get("/", { schema: { hide: true } }, async () => ({ ok: true }));
  await app.ready();
  return app;
}
