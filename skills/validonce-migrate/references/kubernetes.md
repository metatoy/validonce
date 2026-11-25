# Kubernetes CRDs (`x-kubernetes-validations`) to validonce

**Translate, do not rewrite.** The rules already exist, in CEL, in the CRD. validonce reads them and emits `x-validonce` for the ones that match its five kinds; the others are kept as `server_only`. Nobody writes new rules and no old validator needs running, so there is no hand-written source and no runner step. Read `docs/kubernetes.md` (the translation table and the guards) before reporting.

## The steps

1. **Get the CRD or the OpenAPI document as JSON.**
   - From a cluster: `kubectl get crd signups.example.test -o json`.
   - From a file: convert YAML first (`yq -o=json`).
   - Or a Kubernetes OpenAPI v3 document (`/openapi/v3/apis/<group>/<version>`).
2. **Translate at build time:**
   ```sh
   validonce k8s signup-crd.json --out signup.openapi.json --catalog messages.json --report
   ```
   Add `--report` always: it lists, for each CEL rule, whether it was translated or kept as `server_only`, and why. The output is an OpenAPI 3.1 document with `x-validonce` next to each `x-kubernetes-validations`, plus the message catalog (each rule's CEL `message`).
3. **Or in the browser,** from the API server: `translateKubernetesOpenApi(doc)` then `rulesAt(augmented, "test.example.v1.Signup", "/properties/spec")` (`validonce/kubernetes`). From a CRD object in code: `translateCrd(crd)`.
4. **Wire it to the form** like any other `x-validonce`: `withRules(baseSchema, rules, { messages: catalog })` (see `docs/live-rules.md`). Rules sit on the schema node that carries the validations (`spec`), so the form adds the `spec.` prefix.
5. **Dry-run the rest.** For `server_only` rules send the resource with `dryRun=All` (`dryRunUrl`, `dryRunIssues`, `k8sServerCatalog`) so the API server's answer lands on the right field. Nothing is dropped.

## What translates (and what stays `server_only`)

| CEL shape | validonce | Guard |
|---|---|---|
| `!(cond) \|\| has(self.f)`, `cond ? has(self.f) : true` | `required_when` | G-blank, G-key |
| `self.a >= self.b`, `self.a <op> lit` (numbers, strings, `format: date`/`date-time`) | `compare` | G-missing (both sides `required`, or the `!has(a) \|\| !has(b) \|\| ...` form) |
| `has(a) \|\| has(b)` | `at_least_one_of` | G-blank |
| `[has(a), has(b)].exists_one(x, x)` | `exactly_one_of` | G-blank |
| `has(a) == has(b)` | `all_or_none` | G-blank |
| arithmetic, string functions (`size()`, `matches()`), list macros (`all`, `exists`, `map`), `oldSelf` (transition rules), `self.a.b` (nested), `timestamp()` on a string with no `format` | not translated | `server_only` |

A rule is translated **only when its guard holds**; otherwise it is `server_only` and the report says why. The guards:

- **G-blank:** the field cannot hold `""` or `[]` (a string with `minLength: 1`, a `format` of `date`/`date-time`, an `enum` without `""`, an array with `minItems: 1`, or a non-string type). CEL's `has()` is true for `""`; validonce's blank is not.
- **G-key:** the field is `required`, has a `default`, or the rule guards it with `has()`. Kubernetes errors when a rule reads a missing field.
- **G-missing:** a compare passes when a side is missing, as the usual `!has(...) ||` form does.

## Making more rules translate (a CRD change: ask first)

Do not edit the user's CRD without asking. Offer, in the report, these changes that turn `server_only` rules into browser rules: `minLength: 1` on text fields, `format: int32` (or `minimum`/`maximum` within +/-2^53) on integers, a `pattern` limiting `date-time` fractions to three digits, and `has()` guards on comparisons. Then rerun `validonce k8s --report` and show the before/after counts.

## Traps

- **Defaults:** the server applies `default` before CEL runs, so a defaulted field is never absent there. The browser cannot know that; the guard keeps such rules `server_only` unless the field is `required` or guarded.
- **Precision:** CEL compares timestamps to the nanosecond, validonce to the millisecond (hence the fraction pattern); integers beyond 2^53 are exact in CEL and approximate in JavaScript.
- **Strings** compare by code point in both, case-sensitively.
- **Per-version CRDs:** a CRD with several versions gives `Signup_v1`, `Signup_v1beta1`...; use the version the console talks to.
- **Messages:** CEL `message` / `messageExpression` become the catalog entry; `messageExpression` is dynamic and is kept as the static `message` if present. The server's text is what users see on a dry run.
- **Not an old-validator check.** There is no old validator to diff against. The proof is the repo's `k8s-cel-diff` CI (every translated rule against Kubernetes' own verdicts); for the user's CRD, show the `--report` output. Do not claim a differential PASS.
- **`oldSelf` / transition rules** compare to the stored object: server-only by nature.

## What stays hand-written

Nothing new is written by hand: `server_only` rules stay in the CRD, answered by the API server (dry run). If the console needs an instant check for one of them, say which rule and why it is not translatable (the report's reason), and offer the CRD change above.
