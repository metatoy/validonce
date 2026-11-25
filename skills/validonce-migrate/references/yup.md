# yup to validonce

Server rules live in C# or Python. The form schema keeps its field-level checks; cross-field `when`/`test` checks are removed once the rules are applied through the validonce Zod adapter (`withRules`) or, when the form library is built on yup, evaluated with `evaluate` from `validonce` in a `test`. Run the old validator with `scripts/run-js.mjs --kind yup` (it uses `validate(input, { abortEarly: false })`). Ground truth: `testbeds/before/yup/signup.mjs`.

## Before to after, per kind

### required_when (`.when` with `is`/`then`)

```js
// before
company: yup.string().nullable().when("plan", { is: "pro", then: (s) => s.required("Company is required") }),
```
```json
{ "kind": "required_when", "field": "company", "when": { "eq": { "field": "plan", "value": "pro" } }, "message": { "key": "rules.company_required" } }
```
`is: "pro"` and `is: (v) => v === "pro"` are `eq`; an `is` function testing membership in a list is `in`; `is: (v) => !!v` is `present`; `is: (a, b) => a && b` over two sibling refs is `all` of `present` conditions (check each is a blank test).

### compare (`.test` with `this.parent`, `ref`)

```js
// before
end: yup.string().nullable().test("end-after-start", "End must not be before start", function (end) {
  if (!end) return true;
  return end >= this.parent.start;
}),
quantity: yup.number().integer().required().min(1, "Quantity must be at least 1"),
```
```json
{ "kind": "compare", "left": {"field": "end"}, "op": "ge", "right": {"field": "start"}, "type": "date", ... }
{ "kind": "compare", "left": {"field": "quantity"}, "op": "ge", "right": {"value": 1}, "type": "number", ... }
```
`.min(1)`/`.max(n)` on a number with a constant is single-field: it can stay as yup (it is not cross-field). Migrating it is optional and only worthwhile when the server must share it (the `Signup.compare.quantity` rule does that).
On `yup.number()` and `yup.date()`: `.moreThan(ref("start"))` is `gt`, `.min(ref("start"))` is `ge`, `.lessThan(ref)` is `lt`, `.max(ref)` is `le`. On `yup.string()`, `.min(ref)` is a **length** check, not a comparison: it is not `compare`. Also, yup's `.min(ref)` with the referenced field missing **fails** ("greater than or equal to undefined"), while validonce `compare` passes when either side is blank.

### groups

```js
.test("one-of", "...", (v) => !!(v.email || v.phone))                       // at_least_one_of
.test("xor", "...", (v) => !!v.card !== !!v.invoice)                         // exactly_one_of
```

## Traps

- **`required()` rejects `""`, `null`, `undefined`** for strings: same as blank, and `" "` passes, as in validonce. `yup.number().required()` accepts `0`: matches. But in yup 1.x `yup.array().required()` **accepts `[]`**, while `[]` is blank in validonce: a difference to expect for array fields.
- **Cast before validate.** yup casts values by default: `"5"` becomes `5` for `yup.number()`, `"true"` becomes `true`, strings are trimmed only with `.trim()`. validonce never coerces and evaluates the wire value. The runner feeds raw inputs, so a cast-dependent rule shows as a divergence or a parse-class result; use `.strict()` in the old schema first, or keep the rule hand-written. Comparisons that rely on casting (`number` vs numeric string) are coercing: not migrated.
- **`.test` paths.** `createError({ path })` or the field the test is attached to decides the error field; a schema-level `.test` has path `""`. Set the rule's `path` to the field the form shows.
- **`abortEarly`.** Default `true` stops at the first error; the runner uses `false`. validonce reports every rule.
- **`this.parent` vs `$ref`.** `this.parent` only sees the **sibling** values in the same object: same scope as a v1 rule. A test reading `this.from` (ancestors) is cross-object: keep it.
- **Date comparison.** `yup.date()` casts to `Date` objects (and accepts many string forms); the wire carries a string. Rules compare ISO strings of `type: "date"`/`"datetime"`; for `yup.string()` dates (as in the fixture) the comparison is lexicographic and equals a date compare only for well-formed values. `yup.string()` and a `format: date` in the OpenAPI document do not enforce the format: without a runtime check, malformed dates and datetimes the old test rejected pass a `date` compare, and the generated inputs do not show it.
- **`when` with several keys** (`when(["a","b"], ...)`) is `all`/`any` over conditions; read the `is` function carefully.
- **`otherwise`** branches: `then: required, otherwise: notRequired` is just `required_when`; `otherwise: required` means `not` of the condition.
- **`lazy`, `mixed().test` using services or `await`** (async tests) never map.
