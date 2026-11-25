# Kubernetes custom resources

Kubernetes custom resource definitions (CRDs) carry cross-field rules in their OpenAPI schemas, under `x-kubernetes-validations`. The rules are written in CEL (`self.maxReplicas >= self.minReplicas`), and only the API server enforces them. A console that edits these resources has no rules in the browser: users submit, get rejected, and read the server's message.

validonce translates the CEL rules that match its five rule kinds into `x-validonce`. Every validonce frontend then enforces them instantly, with no hand-written client rules. Rules it cannot translate are kept as `server_only`, and a dry run asks the API server about them.

## What you get

- Rules that match a validonce kind run in the browser, and the user sees the same message Kubernetes would send.
- Everything else still reaches the API server. Nothing is dropped.
- The result is a normal OpenAPI document with `x-validonce`, so the same rules feed the form libraries and the generator plugins.

## In the browser, from `/openapi/v3`

The API server serves the schemas of each group and version at `/openapi/v3/apis/<group>/<version>`. Fetch the document with the console's existing client and translate it:

```ts
import { rulesAt, translateKubernetesOpenApi } from "validonce/kubernetes";

const doc = await client.get("/openapi/v3/apis/example.test/v1");
const { doc: augmented, catalog, report } = translateKubernetesOpenApi(doc);
const rules = rulesAt(augmented, "test.example.v1.Signup", "/properties/spec");
```

Then build the form as in [Loading rules at runtime](live-rules.md): `withRules(baseSchema, rules, { messages: catalog })`.

Rules sit on the schema node that carries `x-kubernetes-validations`, so a rule on `spec` gives a `RuleSet` for the `spec` fields. Adding the `spec.` prefix is the form's job.

## At build time: `validonce k8s`

```sh
kubectl get crd signups.example.test -o json | validonce k8s - --out signup.openapi.json --catalog messages.json --report
```

The input is a CRD manifest or a Kubernetes OpenAPI v3 document, as JSON (convert YAML first). For a CRD, the output is an OpenAPI 3.1 document with one component schema per version (`Signup`, or `Signup_v1` when there are several). For an OpenAPI document, it is the same document. Either way, `x-validonce` sits next to each `x-kubernetes-validations`, and `--catalog` writes the message catalog (each rule's CEL `message`). `--report` prints, for each rule, whether it was translated or kept as `server_only`, and why. Use this path for a smaller bundle, or to feed the generator plugins.

## What cannot be translated: the dry run

Rules with arithmetic, string functions, list macros, or `oldSelf` stay on the server. To show their errors on the right fields, send the resource to the API server with `dryRun=All`. It validates the object and stores nothing.

```ts
import {
  dryRunIssues,
  dryRunUrl,
  k8sServerCatalog,
} from "validonce/kubernetes"; // the helpers live in js/src/kubernetes-dryrun.ts for now
import { fieldErrorsFromIssues } from "validonce/server-errors";

const res = await client.post(dryRunUrl(`/apis/example.test/v1/namespaces/${ns}/signups`), body);
if (res.status === 422) {
  const issues = dryRunIssues(await res.json(), { root: "spec" });
  const errors = fieldErrorsFromIssues(issues, { ...catalog, ...k8sServerCatalog });
  // errors: { company: "Company must be 40 characters or fewer" }
}
```

- `dryRunUrl(url)` adds `dryRun=All` to a resource URL. No Kubernetes client is bundled.
- `dryRunIssues(status, { root })` turns a `Status` failure (`reason: Invalid`, `code: 422`, `details.causes[]`) into issues. Each cause's `field` (`spec.end`, `spec.items[2].end`) becomes a path relative to `root` (default `spec`, so `["items", "2", "end"]`).
- Each issue has `ruleId` and `key` `k8s.server`, and `params: { message, reason }`. Add `k8sServerCatalog` to your catalog and the user sees the text the server wrote, without Kubernetes' `Invalid value: ...:` prefix.
- A CEL rule with `fieldPath` lands on that field. A rule without one is reported on the object that carries it (`spec`), which gives an empty path: show it as a form-level error.
- Any other body, such as a 403 or a non-`Status` answer, returns no issues.

The API server also catches schema errors (a wrong enum value, a missing required field), and these come back the same way, so the dry run is useful for more than `server_only` rules.

## Translation table

These are checked against the API server's own CRD validation code: `apiextensions-apiserver` with prune, defaults, schema validation, then CEL. CI runs every translated rule against Kubernetes' verdicts on the same inputs (the `k8s-cel-diff` job, fixtures in `conformance/kubernetes/`), and fails if validonce would ever block an object Kubernetes accepts.

A rule is translated only when its **guard** holds; otherwise it is kept as `server_only` with the reason in the report.

| CEL shape (and its mirror forms) | validonce | Guard |
|---|---|---|
| `!(cond) \|\| has(self.f)`, `cond ? has(self.f) : true` | `required_when` | G-blank on `f` and on fields tested with `has()`; G-key on fields compared with `==`, `!=`, `in`; no `default` on fields read for presence |
| `&&` `\|\|` `!` in a condition | `all` / `any` / `not` | none |
| `self.x == lit`, `!= lit`, `in [lits]` | `eq` / `ne` / `in` | G-key; the literal's type equals the field's type |
| `self.a <op> self.b`, `self.a <op> lit` on numbers | `compare` (number) | G-missing; integers need `format: int32` or `minimum` and `maximum` within ±2^53; mixed int and double only for `<` `<=` `>` `>=` |
| the same on strings | `compare` (string) | G-missing and G-blank on every operand |
| fields with `format: date` | `compare` (date) | G-missing |
| fields with `format: date-time`, with or without `timestamp()` | `compare` (datetime) | G-missing; a `pattern` limiting fractional seconds to 3 digits |
| `has(self.a) \|\| has(self.b) \|\| …` | `at_least_one_of` | G-blank on every member |
| `[has(..), ..].exists_one(x, x)`, `(has(a) ? 1 : 0) + … == 1` | `exactly_one_of` | G-blank on every member |
| `has(self.a) == has(self.b)`, `(has(a) && has(b)) \|\| (!has(a) && !has(b))` | `all_or_none` | G-blank on every member |
| `timestamp()` on a string without `format`; arithmetic; string functions; macros; `oldSelf`; `self.a.b` | not translated | kept as `server_only`, or only reported |

**Guards:**
- **G-blank:** the field can't hold `""` or `[]`. That means a string with `minLength` ≥ 1, a `format` of `date` or `date-time`, or an `enum` without `""`; an array with `minItems` ≥ 1; or another type.
- **G-key:** the field is `required`, has a `default`, or the rule itself guards it with `has()`. Kubernetes errors when a rule reads a missing field.
- **G-missing:** both sides of a comparison are `required`, or the rule is written `!has(self.a) || !has(self.b) || self.a >= self.b`. This is the usual form, and it means exactly what validonce's compare does: skip when a side is missing.

### Why the guards

- **`has()` versus blank.** CEL's `has()` is false for a missing field and for an explicit `null`, as validonce's blank is. It differs only on `""` and `[]`, which CEL counts as present. G-blank rules those out.
- **Defaults** are applied before CEL runs, so a defaulted field is never absent on the server. The browser can't know that.
- **Precision.** CEL compares timestamps to the nanosecond, validonce to the millisecond. That is why date-time compares need a pattern limiting the fraction to 3 digits.
- **Large integers.** Integers beyond 2^53 are exact in CEL and approximate in JavaScript.
- **Strings** compare by code point in both, including case, U+FFFF versus U+10000, and unnormalised text.

**Write translatable CRDs:** give text fields `minLength: 1`, give integers `format: int32` (or `minimum` and `maximum`), give date-time fields a pattern limiting fractions to milliseconds, and guard comparisons with `has()`. Run `validonce k8s --report` to see which rules translate and why the rest don't.

## Example

[`examples/k8s-form`](../examples/k8s-form) is a React form for a sample `Signup` CRD ([`crd/signup-crd.yaml`](../examples/k8s-form/crd/signup-crd.yaml)). Four of its rules run in the browser. The fifth (`self.company.size() <= 40`) is answered by a recorded Kubernetes 422 through `dryRunIssues`, so the example needs no cluster.
