# Kubernetes custom resources

> **Draft.** The translator (`validonce/kubernetes`) and the `validonce k8s` command are being built (Plan G). This page describes how they will be used; sections marked *to be filled* wait for the semantics spike.

Kubernetes custom resource definitions (CRDs) carry cross-field rules in their OpenAPI schemas, under `x-kubernetes-validations`. The rules are written in CEL (`self.maxReplicas >= self.minReplicas`), and only the API server enforces them. A console that edits these resources has no rules in the browser: users submit, get rejected, and read the server's message.

validonce translates the CEL rules that match its five rule kinds into `x-validonce`. Every validonce frontend then enforces them instantly, with no hand-written client rules. Rules it cannot translate are kept as `server_only`, and a dry run asks the API server about them.

## What you get

- Rules that match a validonce kind run in the browser, and the user sees the same message Kubernetes would send.
- Everything else still reaches the API server. Nothing is dropped.
- The result is a normal OpenAPI document with `x-validonce`, so the same rules feed the form libraries and the generator plugins.

## In the browser, from `/openapi/v3`

The API server serves the schemas of each group and version at `/openapi/v3/apis/<group>/<version>`. Fetch the document with the console's existing client and translate it:

```ts
// To be confirmed when the translator lands: names may change.
import { translateKubernetesOpenApi, rulesAt } from "validonce/kubernetes";

const doc = await client.get("/openapi/v3/apis/example.test/v1");
const { doc: augmented, catalog } = translateKubernetesOpenApi(doc);
const rules = rulesAt(augmented, "test.example.v1.Signup", "spec");
```

Then build the form as in [Loading rules at runtime](live-rules.md): `withRules(baseSchema, rules, { messages: catalog })`.

Rules sit on the schema node that carries `x-kubernetes-validations`, so a rule on `spec` gives a `RuleSet` for the `spec` fields. Adding the `spec.` prefix is the form's job.

## At build time: `validonce k8s`

```sh
validonce k8s signup-crd.json --out signup.augmented.json --report
```

The input is a CRD manifest or an OpenAPI document, as JSON. The output is the same document with `x-validonce` added next to each `x-kubernetes-validations`. `--report` prints, for each rule, whether it was translated or kept as `server_only`, and why. Use this path for a smaller bundle, or to feed the generator plugins.

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

*To be filled from the semantics spike (Plan G, Part 0).* For each CEL shape: the validonce rule it becomes, and whether the match is **exact**, **exact with a guard**, or **dropped** (kept as `server_only`).

| CEL shape | validonce | Status |
|---|---|---|
| `self.plan != 'pro' \|\| has(self.company)` | `required_when` | *to be filled* |
| `self.a <op> self.b` (numbers) | `compare` (number) | *to be filled* |
| `self.a <op> self.b` (strings) | `compare` (string) | *to be filled* |
| `timestamp(self.a) <op> timestamp(self.b)`, date-format strings | `compare` (datetime / date) | *to be filled* |
| `has(self.a) \|\| has(self.b)` | `at_least_one_of` | *to be filled* |
| sum-of-ternaries `== 1`, `exists_one` | `exactly_one_of` | *to be filled* |
| `has(self.a) == has(self.b)` | `all_or_none` | *to be filled* |
| anything else | `server_only` | by design |

### Semantics notes

*To be filled:* `has()` versus a blank value, int and double comparison, string order, date and timezone handling, and unset operands.

## Example

[`examples/k8s-form`](../examples/k8s-form) is a React form for a sample `Signup` CRD ([`crd/signup-crd.yaml`](../examples/k8s-form/crd/signup-crd.yaml)). Four of its rules run in the browser. The fifth (`self.company.size() <= 40`) is answered by a recorded Kubernetes 422 through `dryRunIssues`, so the example needs no cluster.
