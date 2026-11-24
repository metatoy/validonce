# Client: Vue

Use the server's rules in a Vue 3 form with VeeValidate and Zod 4. The same code works against ASP.NET Core and FastAPI.

```sh
pnpm add validonce zod vee-validate vue
```

## What VeeValidate accepts

Checked against the published packages (May 2026):

| Version | `validationSchema` takes | Zod 4 |
|---|---|---|
| `vee-validate` 4.15.1 (`latest`) | its own `TypedSchema` (`{ __type: "VVTypedSchema", parse() }`) | `@vee-validate/zod` peers `zod ^3.24`, so it does not take Zod 4 |
| `vee-validate` 5.0.0-beta.0 (`beta`) | any Standard Schema, directly (`TypedSchema` is gone) | yes, a Zod 4 schema plugs in |

So on VeeValidate 4, `validonce/vue` has `toVeeSchema(schema)`, which wraps a Standard Schema (a `withRules` Zod schema) as a `TypedSchema`. On VeeValidate 5, pass the schema straight to `validationSchema` and skip the adapter. The other helper, `watchDependents`, is the same on both.

## 1. Load the rules

```ts
import { rulesFromOpenApi } from "validonce/openapi";

const doc: unknown = await (await fetch("http://localhost:5080/openapi/v1.json")).json();
const rules = rulesFromOpenApi(doc, "Signup"); // RuleSet | undefined
if (!rules) throw new Error("no x-validonce rules for Signup");
```

FastAPI serves `/openapi.json`, ASP.NET Core serves `/openapi/v1.json`. To skip the fetch, run `npx validonce extract openapi.json -o src/rules.gen.ts` at build time.

## 2. Attach them to a Zod schema

```vue
<script setup lang="ts">
import { useForm } from "vee-validate";
import { toVeeSchema, watchDependents } from "validonce/vue";
import { withRules } from "validonce/zod";
import { z } from "zod";

const messages: Record<string, string> = {
  "rules.company_required": "Company is required on the Pro plan",
  "rules.end_after_start": "End date must be on or after the start date",
  "rules.quantity_min": "Quantity must be at least {min}",
};

const baseSchema = z.object({
  plan: z.enum(["free", "pro"]),
  company: z.string().nullable(),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  start: z.string().min(1, "Start date is required"),
  end: z.string().nullable(),
  quantity: z.number("Quantity is required"),
});
type FormValues = z.input<typeof baseSchema>;

const schema = withRules(baseSchema, props.rules, { messages });
const form = useForm<FormValues>({
  validationSchema: toVeeSchema(schema), // VeeValidate 5: validationSchema: schema
  initialValues: { plan: "free", company: null, email: "", start: "", end: null, quantity: 1 },
});
const { values, errors, setFieldValue, handleSubmit } = form;
watchDependents(form, props.rules);
</script>
```

Show `errors.company` under the company input. `{min}` is filled from the rule's params. A key with no entry in `messages` falls back to a default text for the rule kind.

Blank inputs must become `null` for nullable fields, or the Zod type check fails first:

```vue
<input :value="values.company ?? ''" @input="setFieldValue('company', (($event.target as HTMLInputElement).value) || null)" />
```

## 3. Re-check dependent fields

VeeValidate validates a field when it changes, so an error on `company` goes stale when only `plan` changes. `watchDependents(form, rules)` watches each field that other rules read and calls the form's `validateField` for the fields where those rules report. Call it once, in `setup()`, after `useForm`. It returns a function that stops the watchers (they also stop with the component).

`dependentFields(rules)` (also exported from `validonce/vue` and `validonce/deps`) returns the whole map, for example `{ plan: ["company"], start: ["end"] }`. Rules marked `server_only` are skipped.

## 4. Show server errors

The server can still reject a request the browser accepted. Map its 422 body onto the same fields:

```ts
import { fieldErrorsFromIssues, issuesFromResponse } from "validonce/server-errors";

const res = await fetch("http://localhost:5080/signups", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(values),
});
if (!res.ok) {
  const body: unknown = await res.json().catch(() => null);
  serverErrors.value = fieldErrorsFromIssues(issuesFromResponse(body), messages, rules); // { company: "..." }
}
```

`issuesFromResponse` detects the FastAPI body (`detail`) and the ASP.NET body (`validonce`). The two shapes are shown in [Client: React](client-react.md#the-two-422-shapes).

## Gotchas

- **Dates are ISO strings.** Use `isoDate()` from `validonce/zod` (or `z.string()`) with `<input type="date">`, not `z.date()`.
- **Zod 4 skips object refinements when a field fails.** `withRules` adds an always-run check and evaluates the raw input, so rule errors show together with field errors.
- `withRules` throws if a rule names a field the schema does not have.
- VeeValidate 4 validates the whole schema and reads one field's errors from the result, so `validateField("end")` also runs the other rules. This is cheap for form-sized schemas.
- `validonce/vue` imports `vue` (for `watch`); `vue` and `vee-validate` are optional peer dependencies of `validonce`.

Full working form: [examples/vue-form](../examples/vue-form/src/SignupForm.vue). Package reference: [js/README.md](../js/README.md#vee-validate-vue).
