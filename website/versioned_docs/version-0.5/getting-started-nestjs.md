# Getting started: NestJS

Write cross-field rules once with the TypeScript builders. A class decorator carries them, a pipe enforces them and a post-processor publishes them in the `@nestjs/swagger` document. Needs Node 20+ and `@nestjs/common` and `@nestjs/swagger` 11 or later.

## 1. Install

```sh
npm install validonce @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/swagger reflect-metadata rxjs
```

## 2. Write the rules and the class

```ts
import { Body, Controller, Post } from "@nestjs/common";
import { ApiBody, ApiProperty } from "@nestjs/swagger";
import { defineRules, fieldRefs, when } from "validonce/rules";
import { ValidonceRules, ValidonceValidationPipe } from "validonce/nestjs";

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

@ValidonceRules(rules)
export class Signup {
  @ApiProperty({ enum: ["free", "pro"] }) plan!: "free" | "pro";
  @ApiProperty({ nullable: true, required: false }) company?: string | null;
  @ApiProperty({ minLength: 1 }) email!: string;
  @ApiProperty({ format: "date" }) start!: string;
  @ApiProperty({ format: "date", nullable: true, required: false }) end?: string | null;
  @ApiProperty({ type: Number }) quantity!: number;
}

@Controller("signups")
export class SignupsController {
  @Post()
  @ApiBody({ type: Signup })
  create(@Body(new ValidonceValidationPipe(Signup)) body: Signup) {
    return { ok: true };
  }
}
```

Then in `main.ts`:

```ts
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { addValidonceToDocument, ValidonceExceptionFilter } from "validonce/nestjs";

app.useGlobalFilters(new ValidonceExceptionFilter()); // optional: application/problem+json
const document = addValidonceToDocument(
  SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("API").build()),
  [Signup],
);
SwaggerModule.setup("docs", app, document);
```

Other builders: `atLeastOneOf`, `exactlyOneOf`, `allOrNone`, and the condition helpers `allOf`, `anyOf`, `not`. Each takes an options object with `key`, and optionally `params`, `id`, `server_only` and `path`.

## 3. What you get

The document has the rules under `components.schemas.Signup["x-validonce"]`. A request that breaks a rule gets 422 problem details with a top-level `validonce` member (see [Transport](rule-format-v1.md#transport-server-responses)). One response lists every failing rule. In the browser, `issuesFromProblemDetails` or `issuesFromResponse` from `validonce/server-errors` turns the body back into issues.

## Gotchas

- **Two pipes, in this order.** Nest's `ValidationPipe` (class-validator decorators on the class) goes first and answers 400 for a bad field; `ValidonceValidationPipe` goes second and answers 422 for broken rules, which assume well-typed fields. As globals: `app.useGlobalPipes(new ValidationPipe(), new ValidonceValidationPipe())`; per parameter: `@Body(new ValidationPipe(), new ValidonceValidationPipe(Signup))`. See [examples/nestjs-app](../examples/nestjs-app/src/app.ts) for the esbuild variant.
- **`new ValidonceValidationPipe(Signup)`** names the class. With `emitDecoratorMetadata` (tsc, SWC) a global `new ValidonceValidationPipe()` finds it from the parameter type; esbuild and Vite emit no metadata, so name it. Likewise those builds need `@ApiProperty({ type: … })` and `@ApiBody({ type })`.
- **Startup errors.** `defineRules` throws `ValidonceDefinitionError` for an unknown field (when you pass `fields`), a duplicate id or an unsupported compare type; `addValidonceToDocument` throws when a class has no rules or no schema in the document.
- **Schema name** is the class name, so `@ValidonceRules` on `Signup` lands on `components.schemas.Signup`.
- Without `ValidonceExceptionFilter` the 422 body is the same but its content type is `application/json`.

Next: the [React guide](client-react.md) or [Angular guide](client-angular.md). Runnable example: [examples/nestjs-app](../examples/nestjs-app/README.md).
