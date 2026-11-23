# validonce (TypeScript)

Validate once, enforce everywhere. A server exports its cross-field rules as data; this package evaluates them in the browser and attaches them to a Zod 4 schema.

```sh
pnpm add validonce zod
```

`validonce` (the root entry) has no dependencies and no Zod. `validonce/zod` needs `zod@^4`. `validonce/openapi` has no dependencies.

## Read the rules from the OpenAPI document

```ts
import { rulesFromOpenApi } from "validonce/openapi";

const doc = await (await fetch("/openapi.json")).json();
const rules = rulesFromOpenApi(doc, "Signup"); // RuleSet | undefined
```

`allRulesFromOpenApi(doc)` returns every schema's rules by name. A malformed `x-validonce` throws `ValidonceFormatError`.

## Attach them to a Zod schema

```ts
import { z } from "zod";
import { withRules } from "validonce/zod";

const Signup = withRules(
  z.object({
    plan: z.string(),
    company: z.string().nullable().optional(),
  }),
  rules,
  { messages: { "rules.company_required": "Company is required." } },
);
```

- Client rules only: `server_only` rules are skipped.
- The rules run even when another field fails its type check. They evaluate the raw input.
- Each issue has `code: "custom"`, `path`, `message` (catalog entry with `{param}` filled in, else the key) and `params: { validonce: true, ruleId, key, params }`.
- A rule naming a field the schema lacks throws when you call `withRules`.

## react-hook-form

```ts
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

const form = useForm({ resolver: zodResolver(Signup) });
// form.formState.errors.company?.message
```

## Angular Signal Forms

The schema implements Standard Schema, so Angular's `validateStandardSchema` accepts it:

```ts
import { form, validateStandardSchema } from "@angular/forms/signals";

const f = form(model, (path) => validateStandardSchema(path, Signup));
```

## Evaluate without Zod

```ts
import { evaluate, parseRuleSet } from "validonce";

const issues = evaluate(parseRuleSet(raw).rules, data, { side: "client" });
// [{ path, ruleId, key, params }]
```
