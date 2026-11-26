# Client: Angular

Use the server's rules in an Angular form. Signal Forms need no adapter. Reactive Forms use one group validator. Both read the rules from the OpenAPI document.

```sh
pnpm add validonce zod
```

## Load the rules

```ts
import { rulesFromOpenApi } from "validonce/openapi";

const doc: unknown = await (await fetch("http://localhost:5080/openapi/v1.json")).json();
const rules = rulesFromOpenApi(doc, "Signup")!; // or generate them: npx validonce extract openapi.json -o src/rules.gen.ts
```

## Signal Forms

The Zod schema implements Standard Schema, so Angular's `validateStandardSchema` accepts it. Errors recompute when any field changes, so an error on `company` clears when only `plan` changes. No extra wiring.

```ts
import { signal } from "@angular/core";
import { form, validateStandardSchema } from "@angular/forms/signals";
import { withRules } from "validonce/zod";
import { z } from "zod";

const Signup = z.object({
  plan: z.enum(["free", "pro"]),
  company: z.string().nullable(),
  start: z.string(),
  end: z.string().nullable(),
});

const messages = {
  "rules.company_required": "Company is required on the Pro plan",
  "rules.end_after_start": "End date must be on or after the start date",
};

const model = signal({ plan: "free", company: null, start: "", end: null });
const f = form(model, (path) =>
  validateStandardSchema(path, withRules(Signup, rules, { messages })),
);
// f.company().errors() -> [{ kind: "standardSchema", message: "Company is required on the Pro plan", ... }]
```

## Reactive Forms

```ts
import { FormControl, FormGroup } from "@angular/forms";
import { validonceGroupValidator } from "validonce/angular";

const group = new FormGroup(
  {
    plan: new FormControl("free"),
    company: new FormControl(""),
    start: new FormControl(""),
    end: new FormControl(""),
  },
  { validators: validonceGroupValidator(rules, { messages }) },
);
// group.controls.company.errors -> { validonce: { ruleId, key, params, message } }
// group.errors                  -> { validonce: Issue[] }
```

- The validator reads `group.getRawValue()` and sets a `validonce` error on the control at each issue's path. Other errors on that control stay.
- When an issue no longer applies, only the `validonce` error is removed.
- A nested `FormGroup` needs its own validator with that object's rules.
- Use one validator instance per group. `server_only` rules are skipped.

## Show server errors

```ts
import { fieldErrorsFromIssues, issuesFromResponse } from "validonce/server-errors";

// in the HTTP error handler, with the 422 response body:
const errors = fieldErrorsFromIssues(issuesFromResponse(body), messages, rules); // { company: "..." }
```

`issuesFromResponse` accepts the ASP.NET Core body (`validonce` member) and the FastAPI body (`detail` list). Passing `rules` as the third argument gives the same default text as the client check.

## Gotchas

- **Dates must be ISO strings** (`YYYY-MM-DD`). `<input type="date">` gives that. An empty input is `""`, which counts as blank.
- With Signal Forms and Zod 4, `withRules` is needed instead of `.refine()`: Zod 4 skips object refinements when any field fails, and `withRules` uses an always-run check.
- `withRules` throws if a rule names a field the schema lacks.
- A path with no control in a Reactive Form is ignored on the controls; the issue still appears in `group.errors`.

Package reference: [js/README.md](../js/README.md).
