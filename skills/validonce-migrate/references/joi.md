# Joi (Express, Hapi) to validonce

Target: validonce rules written with the TypeScript builders (`defineRules`, `when(...).require(...)`, `F.end.ge(F.start)`, `atLeastOneOf`, `exactlyOneOf`, `allOrNone` from `validonce/rules`), enforced in the route with `evaluate` (or through the Fastify/NestJS/Zod adapters if the app has moved) and published as `x-validonce` in the OpenAPI document (see `docs/how-it-works.md`). The Joi schema keeps its field checks (`string()`, `email()`, `valid(...)`, `required()`); the cross-field `when`/`ref`/`or`/`xor` parts go. Run the old validator with `scripts/run-js.mjs --kind joi` (`schema.validate(input, { abortEarly: false })`). Ground truth: `testbeds/before/joi/`.

Wire names: Joi validates the request body, so its keys **are** the wire names. Watch for `Joi.object().rename(...)` and `.keys()` built from a different casing, and for a body that is mapped (camelCase to snake_case) before Joi sees it: the rule must use the name in the JSON body.

## Where cross-field checks hide

- **`.when(ref, { is, then, otherwise, switch })`** and `Joi.when(...)`, including `Joi.alternatives().conditional(...)`. `.when` on one key reading another is `required_when` or a per-field switch.
- **`Joi.ref("start")`** in `min`, `max`, `greater`, `less`, `valid`, `equal`, `invalid`, `default`, `length`: a comparison against another field (`Joi.date().min(Joi.ref("start"))`). `Joi.ref("$ctx")` reads validation context, not a field.
- **Object-level:** `.or(a, b)`, `.xor(a, b)`, `.oxor(a, b)`, `.and(a, b, c)`, `.nand(a, b)`, `.with(key, [peers])`, `.without(key, [peers])`.
- **`.custom((value, helpers) => ...)`** reading `helpers.state.ancestors[0]` for a sibling, and `.external(...)`.
- **Hapi:** `validate: { payload: schema, failAction }`, plus a `pre` handler. **Express:** a `celebrate`/`express-validation` middleware, or `schema.validate(req.body)` in the handler.

## Before to after, per kind

### required_when (`.when`)

```js
// before
company: Joi.when("plan", { is: "pro", then: Joi.string().required(), otherwise: Joi.any() })
// after
when(F.plan.eq("pro")).require(F.company, { key: "rules.company_required" })
```
`is: Joi.valid("a", "b")` is `.isIn(["a", "b"])`; `is: Joi.exist()` is `.present` (see the blank trap); `not` and nested `when`s become `not` and `all`/`any`.

### compare (`Joi.ref`)

```js
// before
end: Joi.string().allow(null, "").custom((v, h) => (!h.state.ancestors[0].start || v >= h.state.ancestors[0].start ? v : h.error("any.invalid")))
end: Joi.date().min(Joi.ref("start"))
quantity: Joi.number().min(1)
// after
F.end.ge(F.start, { key: "rules.end_after_start", type: "date" })
F.quantity.ge(1, { key: "rules.quantity_min", params: { min: 1 }, type: "number" })
```
`.min(ref)` is `ge`, `.greater(ref)` is `gt`, `.max(ref)` is `le`, `.less(ref)` is `lt`, `valid(Joi.ref(x))` is `eq`, `invalid(Joi.ref(x))` is `ne`. A constant `.min(1)` is a **field** check, not a cross-field one: it is `compare` against a constant only when the rule must stay beside other rules; otherwise leave it in the Joi schema.

### at_least_one_of / exactly_one_of / all_or_none

```js
// before
Joi.object({...}).or("email", "phone")
Joi.object({...}).xor("card", "invoice")
Joi.object({...}).and("street", "city", "postalCode")
// after
atLeastOneOf(F.email, F.phone, { key: "rules.contact_email_or_phone" })
exactlyOneOf(F.card, F.invoice, { key: "rules.pay_one" })
allOrNone(F.street, F.city, F.postalCode, { key: "rules.address_all_or_none", path: "street" })
```
`.with("a", ["b"])` (if `a` is present then `b` must be) is `when(F.a.present()).require(F.b)`; `.without("a", ["b"])` forbids `b` when `a` is present, which has no validonce kind: keep it hand-written.

## Traps

- **Present is not non-blank.** `.or`, `.xor`, `.and`, `.with`, `.nand` count a key as present when it is not `undefined`. `null` and `""` **are present** to Joi, but blank to validonce, so `{ email: "", phone: "5551234" }` passes `.xor("email","phone")` as two present keys (fail) while validonce counts one non-blank (pass). The differential check shows this at the `""` and `null` rows; usually the validonce behaviour is what the form wanted, and the report says so. If the old behaviour must stay, keep the rule hand-written.
- **`string()` rejects `""` by default** (`.allow("")` lifts that) and a `string().required()` in `then` therefore rejects `""` and `null`, matching blank. But `Joi.any()` and `.allow(null, "")` accept both: copy the allowances of the schema you are removing.
- **Convert is on by default.** Joi turns `"5"` into `5`, `"true"` into `true` and ISO strings into `Date` unless `convert: false`. validonce compares the wire value. Dates as `Joi.date()` compare instants and accept many formats; a rule type `date` compares `YYYY-MM-DD`.
- **Unknown keys fail by default** (`"x" is not allowed`). Run the old validator over the migrated rules only, and list every wire field in the Joi object, or the extra keys show as divergences.
- **`Joi.ref` direction:** `Joi.date().min(Joi.ref("start"))` is on the *end* key. The rule's `left` is the key that carries the `min`.
- **Messages:** Joi messages are ignored by the check; keep your message keys.
- **`abortEarly: true`** (Hapi's default) reports one error; the runner uses `abortEarly: false` to list all fields.

## What stays hand-written

`.external()` (async, I/O), `.custom()` that calls services or a clock, `Joi.ref("$context")` checks, `.without` / `.nand`, `.pattern` over key names, array `.unique()` / `.has()` and per-item rules, `.when` that changes a field's **type** or format rather than its presence (for example `Joi.when("kind", { is: "a", then: Joi.number(), otherwise: Joi.string() })`), and every field-level check. Say each one in the report.
