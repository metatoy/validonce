# Getting started: Fastify

Write cross-field rules once with the TypeScript builders. Fastify enforces them in a `preHandler` and `@fastify/swagger` publishes them in OpenAPI. Needs Node 20+, `fastify>=5` and `@sinclair/typebox`.

## 1. Install

```sh
npm install validonce fastify @fastify/swagger @sinclair/typebox
```

## 2. Write the rules and the route

```ts
import swagger from "@fastify/swagger";
import { Type } from "@sinclair/typebox";
import Fastify from "fastify";
import { defineRules, fieldRefs, when } from "validonce/rules";
import { ajvKeywords, swaggerRefResolver, validonceHook, withRules } from "validonce/fastify";

const fields = ["plan", "company", "email", "start", "end", "quantity"] as const;
const F = fieldRefs(...fields);

const rules = defineRules(
  "Signup",
  [
    when(F.plan.eq("pro")).require(F.company, { key: "rules.company_required" }),
    F.end.ge(F.start, { key: "rules.end_after_start", type: "date" }),
    F.quantity.ge(1, { key: "rules.quantity_min", params: { min: 1 }, type: "number" }),
  ],
  { fields },
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

const app = Fastify({ ajv: { customOptions: { keywords: ajvKeywords } } });
await app.register(swagger, {
  openapi: { openapi: "3.1.0", info: { title: "API", version: "1" } },
  refResolver: swaggerRefResolver,
});
app.addSchema(Signup);

app.post(
  "/signups",
  { schema: { body: { $ref: "Signup#" } }, preHandler: validonceHook(Signup) },
  async () => ({ ok: true }),
);
```

Other builders: `atLeastOneOf`, `exactlyOneOf`, `allOrNone`, and the condition helpers `allOf`, `anyOf`, `not`. Each takes an options object with `key`, and optionally `params`, `id`, `server_only` and `path`.

## 3. What you get

`app.swagger()` has the rules under `components.schemas.Signup["x-validonce"]`. A request that breaks a rule gets 422 problem details with a top-level `validonce` member:

```json
{
  "type": "about:blank",
  "title": "One or more validation errors occurred.",
  "status": 422,
  "validonce": [
    { "path": ["company"], "ruleId": "Signup.required_when.company", "key": "rules.company_required", "params": {} }
  ]
}
```

Rules run in a `preHandler`, after Fastify's own schema validation, so a body with a bad field type gets Fastify's 400 and no rule errors. One response lists every failing rule. In the browser, `issuesFromProblemDetails` or `issuesFromResponse` from `validonce/server-errors` turns the body back into issues.

## Gotchas

- **Startup errors.** `defineRules` throws `ValidonceDefinitionError` for an unknown field (when you pass `fields`), a duplicate id, an unsupported compare type, or a group rule with fewer than two fields. Call it at module load so the app fails to start.
- **Compare type is explicit** (`type: "date"`, `"number"`, …) unless you pass `fields` as a map from name to type.
- **Ajv keyword.** Fastify's Ajv runs in strict mode, so pass `keywords: ajvKeywords` (as above) or schema compilation fails on `x-validonce`.
- **Component name.** Without `swaggerRefResolver`, `@fastify/swagger` names the schema `def-0`. The resolver names it after `$id`.
- Ids default to `Schema.kind.field`. Pass `id:` on a collision.
- Rules see the parsed body, so field names are wire names.

Next: the [React guide](client-react.md) or [Angular guide](client-angular.md). Runnable example: [examples/fastify-app](../examples/fastify-app/README.md).
