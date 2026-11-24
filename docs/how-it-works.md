# How it works

validonce moves cross-field rules from the server to the browser as data, not as code.

<p align="center"><img src="../assets/diagram/how-it-works-dark.png" alt="How validonce works. 1, server rules: C# with FluentValidation (RequiredWhen, Compare), Python with Pydantic (__rules__), TypeScript with Fastify or NestJS (validonce/rules), Go with Huma (struct rules), and Java or Kotlin with Spring Boot (Bean Validation). 2, the OpenAPI document: the rules travel as data under x-validonce on components.schemas, five rule kinds in one format. 3, the browser: the validonce runtime, withRules for Zod, with React (react-hook-form), Angular (Signal and Reactive Forms), Vue (VeeValidate) and web components (validonce/dom). The server always enforces every request; a broken rule returns 422 with the same issue shape, mapped back onto each field." width="760"></p>

The sections below follow the rules from left to right: written on the server, exported as data, read and enforced in the browser, and enforced again on the server.

## 1. Write the rules once

In C#, a `ValidonceValidator<T>` (a FluentValidation `AbstractValidator<T>`). In Python, `__rules__` on a `ValidonceModel`. Both validate requests with their own library and both can export the rules.

## 2. Export as data

Each object schema in the OpenAPI document gets an `x-validonce` key:

```json
{ "version": 1, "rules": [
  { "id": "Signup.required_when.company", "kind": "required_when", "field": "company",
    "when": { "eq": { "field": "plan", "value": "pro" } },
    "message": { "key": "rules.company_required" } } ] }
```

There are five rule kinds: `required_when`, `compare`, `at_least_one_of`, `exactly_one_of`, `all_or_none`. Field names are wire names (the names in the JSON body). The full format is in [rule-format-v1.md](rule-format-v1.md).

Field-level rules (type, length, enum, `pattern`) are not in `x-validonce`. They already travel as standard JSON Schema keywords.

## 3. Evaluate on the client

`withRules(schema, rules)` adds one check to a Zod object schema. It runs the rules and returns one Zod issue per failing rule, on the rule's target field. react-hook-form and Angular Signal Forms read the Zod issues. Angular Reactive Forms use `validonceGroupValidator` instead of Zod.

Messages are keys, not text. The server sends `rules.company_required`; the client maps it to text with a catalog, so you can translate it. A key with no entry gets a default per rule kind.

## 4. Same result everywhere

C#, TypeScript and Python each have their own evaluator. A shared suite in `conformance/` (125 cases) pins the behavior they must agree on. Some of the rules that make this work:

- Rules evaluate the JSON wire form, not language objects.
- Blank means missing, `null`, `""` or `[]`. Nothing else.
- No type coercion: `"1"` is not `1`, and a boolean is never a number.
- `compare` passes when either side is blank or has the wrong type. Requiredness is a separate rule.
- Dates are `YYYY-MM-DD` strings. Date-times need an offset and compare at millisecond precision.
- Each failing rule gives exactly one issue, in rule order.

## 5. The server is the authority

Clients may skip checks or run old rules. The server always evaluates every rule, including those marked `server_only`, and answers 422 with the same issue list:

- ASP.NET Core: ProblemDetails with a top-level `validonce` array.
- FastAPI: `detail` entries of type `validonce.<kind>`, with the issue in `ctx`.

`issuesFromResponse` in `validonce/server-errors` reads both and returns the same `Issue[]` the client evaluator produces.

## Known limits

- A rule refers only to fields of its own object. A nested object carries its own rules.
- Rule kinds are fixed to the five above. Custom predicates do not export.
- Evaluators reject a rule-format version they do not know instead of skipping rules.
- A `pattern` can still behave differently per regex engine. Run the [regex linter](regex-findings.md) on your OpenAPI document.

Guides: [ASP.NET Core](getting-started-aspnet.md), [FastAPI](getting-started-fastapi.md), [React](client-react.md), [Angular](client-angular.md).
