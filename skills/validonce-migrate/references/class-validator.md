# class-validator (TypeScript, NestJS) to validonce

Target: for NestJS, `@ValidonceRules(rules)` on the DTO plus `ValidonceValidationPipe` (`validonce/nestjs`; see `docs/getting-started-nestjs.md`), with the rules written once by `defineRules(...)` and `when(...).require(...)`, `F.end.ge(F.start)`, `atLeastOneOf`, `exactlyOneOf`, `allOrNone`. Your field decorators (`@IsString`, `@IsEmail`, `@Min`) keep working beside the rules. Other class-validator users (Express, Fastify) write the same `defineRules` and call `evaluate`, or use the Zod/Fastify adapters. Run the old validator with `scripts/run-js.mjs --kind class-validator` (`plainToInstance` then `validate`). Ground truth: `testbeds/before/class-validator/`.

Wire names: validonce rules use the names in the JSON body. class-validator reports the **TypeScript property name**. They are equal unless the DTO uses `@Expose({ name: "postal_code" })` or `@Transform`, or a global naming interceptor renames keys. The runner reports property names as they are; if the DTO renames, either run the check with the DTO's plain names (and rename in the rule) or say so in the report. This is the main thing the runner cannot map for you.

## Where cross-field checks hide

- **`@ValidateIf((o) => ...)`** on a property: the property's other decorators run only when the predicate holds. `@ValidateIf(o => o.plan === "pro") @IsNotEmpty() company` is `required_when`.
- **Custom constraints:** `@ValidatorConstraint` classes with `validate(value, args)` reading `args.object` or `args.constraints[0]` (`@Match("password")`, `@IsAfter("start")`); `registerDecorator` helpers; `@Validate(MyConstraint, [...])`.
- **`@IsOptional()`** combined with the above, and **`@Equals`**/`@NotEquals` against a literal inside a `@ValidateIf`.
- **NestJS:** a global `ValidationPipe({ transform: true, whitelist: true })`, a custom pipe or an interceptor doing the same checks, and service-level checks after the pipe.
- **`class-validator` + `class-transformer` groups** (`groups: ["create"]`).

## Before to after, per kind

### required_when

```ts
// before
@ValidateIf((o) => o.plan === "pro") @IsNotEmpty() company?: string;
// after
when(F.plan.eq("pro")).require(F.company, { key: "rules.company_required" })
```
`o.plan !== "free"` is `.ne`, `["a","b"].includes(o.plan)` is `.isIn([...])`, `!!o.phone` is `.present`.

### compare

```ts
// before
@ValidateIf((o) => o.end && o.start) @Validate(IsOnOrAfter, ["start"]) end?: string;
@Min(1) quantity: number;
// after
F.end.ge(F.start, { key: "rules.end_after_start", type: "date" })
F.quantity.ge(1, { key: "rules.quantity_min", params: { min: 1 }, type: "number" })
```
The `@ValidateIf(o => o.end && o.start)` guard is what `compare` does by itself and is dropped.

### at_least_one_of / exactly_one_of / all_or_none

```ts
// before
@ValidateIf((o) => !o.phone) @IsNotEmpty() email?: string;
@Validate(AllOrNone, ["city", "postalCode"]) street?: string;
// after
atLeastOneOf(F.email, F.phone, { key: "rules.contact_email_or_phone" })
allOrNone(F.street, F.city, F.postalCode, { key: "rules.address_all_or_none" })
```

## Traps

- **Blank.** `@IsNotEmpty()` rejects `""`, `null` and `undefined` but accepts `" "`, `0`, `false`, `[]` (arrays: use `@ArrayNotEmpty`); `@IsOptional()` skips on `null` **and** `undefined` only. validonce's blank is missing, `null`, `""` or `[]`. `@IsDefined` accepts `""`. Write down which the old code used.
- **`@ValidateIf` is a property-level switch.** It turns off **all** decorators on that property, including ones unrelated to the rule (`@IsEmail` on the same property stops running when the predicate is false). Split them when translating: the field-level decorators must stay unconditional.
- **Decorator conditions run on the transformed object.** With `transform: true`, `@Type(() => Number)` and `enableImplicitConversion` turn `"5"` into `5` before validation; the wire input is a string. validonce compares the wire value (`"5"` is a string, not a number). Differences show in the differential check; keep the type decision in the field schema.
- **`undefined` properties:** without `skipMissingProperties`, a validator on a missing property still runs with `undefined`; custom constraints must handle it. `forbidUnknownValues` and `whitelist` change what the instance holds.
- **Date comparison** in custom constraints often uses `new Date(a) < new Date(b)`: that accepts non-ISO text and compares instants. validonce's `date` compares `YYYY-MM-DD`, `datetime` compares instants with offsets (`Z` equals `+00:00`). If the old code parses loosely, results can differ on odd input. A string comparison (`value >= other`) equals a `date` compare only when a decorator or pipe that runs on the request limits both fields to real `YYYY-MM-DD` dates. `@ApiProperty({ format: "date" })` only describes the field: without a runtime check, malformed dates and datetimes the old code rejected would pass, and the generated inputs (all well formed) do not show it.
- **esbuild decorators:** the runner bundles with `experimentalDecorators` and no decorator metadata. A DTO that needs `emitDecoratorMetadata` (`@Type()` without a function, ValidateNested with implicit types) must state types explicitly.
- **Error path.** `ValidationError.property` for nested objects is the parent key; the runner reports the first segment.

## What stays hand-written

Async constraints that call a service (`@Validate(IsUniqueEmail)` with `async validate`, injected providers: the runner cannot construct them, so say "cannot prove"), nested `@ValidateNested` / `@Type` checks, array-element rules (`each: true`), and field-level decorators. Express the field-level ones in the OpenAPI schema where `@nestjs/swagger` already does.
