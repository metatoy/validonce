# Zod to validonce

Server rules live in C# or Python; the Zod schema stays for field-level checks and gets the rules through `withRules(schema, rules, { messages })` from `validonce/zod` (Zod 4). Run the old validator with `scripts/run-js.mjs --kind zod`. Ground truth: `testbeds/before/zod/signup.mjs`.

If the **server** is also TypeScript there is no validonce server library: this guide then only covers using the rules on the client; the server needs an evaluator call (`evaluate` from `validonce`). Ask the user before choosing.

## Before to after, per kind

### required_when

```ts
// before
.superRefine((v, ctx) => {
  if (v.plan === "pro" && !v.company) {
    ctx.addIssue({ code: "custom", path: ["company"], message: "Company is required" });
  }
})
```
```json
{ "id": "Signup.required_when.company", "kind": "required_when", "field": "company",
  "when": { "eq": { "field": "plan", "value": "pro" } },
  "message": { "key": "rules.company_required" } }
```
Written once on the server (`generate_code`); the Zod schema then becomes:
```ts
const Signup = withRules(baseSignup, rules, { messages });   // baseSignup = the z.object without superRefine
```

### compare

```ts
// before
if (v.end && v.end < v.start) ctx.addIssue({ code: "custom", path: ["end"], message: "End must not be before start" });
if (v.quantity < 1) ctx.addIssue({ code: "custom", path: ["quantity"], message: "..." });
```
```json
{ "kind": "compare", "left": {"field": "end"}, "op": "ge", "right": {"field": "start"}, "type": "date", ... }
{ "kind": "compare", "left": {"field": "quantity"}, "op": "ge", "right": {"value": 1}, "type": "number", ... }
```
Inverse: the old code fails when `end < start`; the rule states what must hold, `end >= start` (`ge`).

### groups

```ts
.refine((v) => !!(v.email || v.phone), { path: ["email"], message: "..." })
```
becomes `at_least_one_of` over `["email","phone"]` (path defaults to the first field, as here). `exactly_one_of`, `all_or_none` likewise.

## Traps

- **`refine` path.** `.refine(fn, { message })` without `path` reports on the **object root** (path `[]`): the runner reports `__root__` and validonce a field. Set the rule's `path` to what the form should show, and expect a location warning to fix, not a verdict difference. `superRefine` with `ctx.addIssue({ path: [...] })` gives the exact field.
- **Refinements may not run when the base object fails.** In Zod 4, `refine`/`superRefine` on an object are skipped when a field already failed its type check (only the `invalid_type` issue is reported), but they still run after non-type failures such as `min(3)`. `withRules` runs the rules on the raw input even when a field fails its type check. The differential check feeds inputs that are type-valid by default, so the two agree; with `includeInvalid` they can differ by design.
- **String comparison of dates.** `v.end < v.start` on ISO dates is a lexicographic string compare: it equals a date compare only when both are well-formed `YYYY-MM-DD`. Use `type: "date"`; malformed dates pass the rule (field validation catches them).
- **Strict equality.** `===` is strict: matches `eq` (no coercion). `==` coerces (`"1" == 1`): a coercing comparison, keep hand-written.
- **Falsy vs blank.** `!v.company` is true for `""`, `null`, `undefined` but also `0` and `false`. For strings it matches blank; for numbers it does not (`!v.quantity` is true for `0`).
- **`z.coerce.*`** converts before the rule sees the value: not migrated (coercion).
- **Dates as `Date` objects / `z.date()`**: the wire is a string; rules see wire JSON. Compare the string fields.
- **`z.object().strict()` / transforms** are field-level and stay.
- **`nullish` vs `nullable`**: rule fields must exist in the object schema or `withRules` throws at load; add a missing optional field to the schema.
- **Client-only checks** (a rule you do not want the server to enforce) are not `server_only`'s opposite: there is no client-only flag. Leave such a check in Zod.
- **react-hook-form**: after `withRules`, add `registerDeps(rules)` so a dependent field is re-checked when its source changes.
