# Client: React

Use the server's rules in a React form with react-hook-form and Zod 4. The same code works against ASP.NET Core and FastAPI.

```sh
pnpm add validonce zod react-hook-form @hookform/resolvers
```

## 1. Load the rules

```ts
import { rulesFromOpenApi } from "validonce/openapi";

const doc: unknown = await (await fetch("http://localhost:5080/openapi/v1.json")).json();
const rules = rulesFromOpenApi(doc, "Signup"); // RuleSet | undefined
if (!rules) throw new Error("no x-validonce rules for Signup");
```

FastAPI serves `/openapi.json`, ASP.NET Core serves `/openapi/v1.json`. For FastAPI, `rulesFromOpenApi` also finds `Signup-Input`. To skip the fetch, run `npx validonce extract openapi.json -o src/rules.gen.ts` at build time.

## 2. Attach them to a Zod schema

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
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

const schema = useMemo(() => withRules(baseSchema, rules, { messages }), [rules]);
const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: { plan: "free", company: null, email: "", start: "", end: null, quantity: 1 },
});
```

Show `errors.company?.message` under the company input. `{min}` is filled from the rule's params. A key with no entry in `messages` falls back to a default text for the rule kind.

Blank inputs must become `null` for nullable fields, or the Zod type check fails first. The example form does it with `register("company", { setValueAs: (v) => (v === "" ? null : v) })`.

## 3. Show server errors

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
  const serverErrors = fieldErrorsFromIssues(issuesFromResponse(body), messages); // { company: "..." }
}
```

`issuesFromResponse` detects the FastAPI body (`detail`) and the ASP.NET body (`validonce`). Nested paths come out dotted, for example `bookings.1.end`.

### The two 422 shapes

ASP.NET Core:

```json
{ "status": 422, "errors": { "Company": ["rules.company_required"] },
  "validonce": [{ "path": ["company"], "ruleId": "Signup.required_when.company",
                  "key": "rules.company_required", "params": {} }] }
```

FastAPI:

```json
{ "detail": [{ "type": "validonce.required_when", "loc": ["body", "company"],
               "msg": "rules.company_required",
               "ctx": { "ruleId": "Signup.required_when.company",
                        "key": "rules.company_required", "params": {} } }] }
```

## 4. Re-check dependent fields

react-hook-form validates a field when it changes, so an error on `company` goes stale when only `plan` changes. `registerDeps` lists the fields to re-check:

```tsx
import { registerDeps } from "validonce/react-hook-form";

const deps = registerDeps(rules);
<select {...register("plan", { ...deps("plan") })} /> // re-checks "company"
```

`dependentFields(rules)` returns the whole map.

## Gotchas

- **Dates are ISO strings.** Use `z.string()` and `<input type="date">` (`YYYY-MM-DD`), not `z.date()`. A `Date` object is not a date to the rules.
- **Zod 4 skips object refinements when a field fails.** A normal `.refine()` on the object would not run while another field is invalid, so errors would appear one at a time. `withRules` adds an always-run check and evaluates the raw input, so rule errors show together with field errors.
- `withRules` throws if a rule names a field the schema does not have. This catches renames early.
- Rules marked `server_only` are skipped in the browser.
- An empty string counts as blank, like `null`, `[]` and a missing key.

Full working form: [examples/react-form](../examples/react-form/src/App.tsx). Package reference: [js/README.md](../js/README.md).
