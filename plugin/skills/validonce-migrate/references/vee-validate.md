# VeeValidate (Vue forms) to validonce

Target: `validonce/vue` plus the Zod adapter: `withRules(baseSchema, rules, { messages })` wrapped for VeeValidate 4 with `toVeeSchema(schema)` (on VeeValidate 5 pass the schema straight to `validationSchema`), and `watchDependents(form, rules)` so a field's error refreshes when the field it depends on changes (see `docs/client-vue.md` and `examples/vue-form`). The form no longer carries its own cross-field checks: the rules come from the server's OpenAPI document (`x-validonce`).

VeeValidate has no rule engine of its own for cross-field logic: it hosts one. So the migration source is **whatever the form passes to `validationSchema` or `defineRule`**:

| The form uses | Treat it as | Runner |
|---|---|---|
| a **yup** schema (`toTypedSchema(yup.object(...))`, or yup directly) | yup: read `references/yup.md` | `run-js.mjs --kind yup` |
| a **Zod** schema (`toTypedSchema(z.object(...).refine(...))`) | Zod: read `references/zod.md` | `run-js.mjs --kind zod` |
| `defineRule` / `useForm({ validationSchema: { field: "required|confirmed:@pw" } })` string and function rules (global rules from `@vee-validate/rules`) | form-level rules, below | write them as a yup or plain function schema first |
| a `validate` function passed to `useField` / `useForm`, or `handleSubmit` checks | form-level `validate`, below | same |

Headless proof: the repo's CI proves the yup runner on the Contact contract (`testbeds/before/yup/contact.mjs`) and the Signup contract. VeeValidate itself needs a Vue component, so the runner runs the schema it hosts, not the component.

Wire names: the form's `name` for each field is the key VeeValidate sends. Check that it equals the **wire name** in the JSON body the API receives. A form that maps values (`camelCase` to `snake_case`) in `handleSubmit` needs the rule to use the wire name, and `watchDependents` to be given the form's own names.

## Where cross-field checks hide

- **Schema-level:** yup `.when("plan", ...)`, `.test(function () { this.parent ... })`, `ref("start")`; Zod `.refine`, `.superRefine`, `.check`.
- **Field-level rules that name another field:** `confirmed:@email`, `required_if:@plan,pro`, `min_value:@start`, `after:@start` (the `@field` syntax); `defineRule("afterStart", (value, [other], ctx) => ...)` reading `ctx.form`.
- **Form-level `validate`:** a function in `useForm({ validationSchema: (values) => ... })` or `form.setErrors(...)` after a custom check.
- **`watch` on one field calling `validateField` on another** (the manual refresh that `watchDependents` replaces).
- **`useIsFieldDirty`/`values` reads inside computed `required` flags**: a visual requirement without a validator is a hint that the rule lives only in the UI.

## Before to after

```js
// before: yup inside VeeValidate
const schema = toTypedSchema(yup.object({
  plan: yup.string().required(),
  company: yup.string().when("plan", { is: "pro", then: (s) => s.required() }),
  end: yup.string().test("after", "End must not be before start", function (v) { return !v || v >= this.parent.start; }),
}));
const { errors } = useForm({ validationSchema: schema });
```
```ts
// after: base schema (fields only) + the server's rules
const schema = withRules(baseSchema, rules, { messages });
const form = useForm({ validationSchema: toVeeSchema(schema) }); // VeeValidate 5: validationSchema: schema
watchDependents(form, rules);
```
Kinds map exactly as in `yup.md` and `zod.md`: `.when` with `is` is `required_when`; a `test` comparing a sibling is `compare`; a `test` over several fields being all blank or all set is `at_least_one_of` / `all_or_none`. The `@field` rules map the same way: `required_if:@plan,pro` is `required_when`, `after:@start` is `compare` (`gt`), `min_value:@start` is `compare` (`ge`), `confirmed:@pw` is `compare` `eq` on strings.

## Traps

- **Validation timing.** VeeValidate validates a field when that field changes. A rule error on `company` goes stale when only `plan` changes. Without `watchDependents` the form looks fine until submit. Call it once in `setup()`, after `useForm`.
- **Errors by field.** `errors.value.company` is one string (the first message). validonce reports by rule path (default: the first field); set `path` when the old form showed the error elsewhere.
- **Blank:** `required` in `@vee-validate/rules` rejects `""`, `null`, `undefined` and `[]`, and treats whitespace-only text as empty (it trims). validonce does not trim: `" "` is not blank. Check whether the old form relied on trimming.
- **Number inputs.** `<input type="number">` gives strings unless `v-model.number` is used; VeeValidate casts nothing. A `compare` of type `number` on the wire value is what the server checks: convert in the base schema (`z.coerce.number()`), not in the rule.
- **Dates.** `<input type="date">` gives `YYYY-MM-DD` for years up to 9999, but the schema itself does not check that: a string comparison in the old schema ordered any text, a `date` compare skips values that are not dates, and a `format: date` in the OpenAPI document does not enforce it. A `datetime-local` has no offset: the `datetime` compare needs one.
- **Dynamic fields** (`v-if`, array fields with `FieldArray`): rules over a field that is not rendered must not fail it; the field has to be absent from the values, not `""`.
- **Zod 4 skips object refinements when a field fails.** `withRules` adds an always-run check, so rule errors show with field errors (see `client-vue.md`).

## What stays hand-written

Async rules (`defineRule` returning a promise: uniqueness, existence), per-array-item checks, rules reading a store, a route or the clock, UI-only requirements (a star next to a label), and every field-level rule. They stay in the form; say so in the report.
