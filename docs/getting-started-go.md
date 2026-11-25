# Getting started: Go

> **Try it first:** [the playground with Go](https://playground.metatoy.com/?backend=go&frontend=react) runs this backend live, with React, Angular, Vue or a plain form.

Write cross-field rules once next to a Go struct. The server enforces them, Huma publishes them in OpenAPI, and the browser forms read them. Needs Go 1.26 or later.

## 1. Install

```sh
go get github.com/metatoy/validonce/go
```

The core package has no dependencies beyond the standard library. `github.com/metatoy/validonce/go/humaonce` adds Huma, `github.com/metatoy/validonce/go/playground` adds go-playground/validator.

## 2. Write the struct and the rules

```go
type Signup struct {
	Plan     string  `json:"plan" enum:"free,pro"`
	Company  *string `json:"company,omitempty" nullable:"true"`
	Email    string  `json:"email" minLength:"1"`
	Start    string  `json:"start" format:"date"`
	End      *string `json:"end,omitempty" format:"date" nullable:"true"`
	Quantity int32   `json:"quantity"`
}

var signupRules = validonce.MustBuild[Signup](
	validonce.When(validonce.Eq("plan", "pro")).Require("company", validonce.Key("rules.company_required")),
	validonce.Cmp("end").Ge(validonce.Ref("start"), validonce.Key("rules.end_after_start")),
	validonce.Cmp("quantity").Ge(validonce.Val(1), validonce.Key("rules.quantity_min"),
		validonce.Params(map[string]any{"min": 1})),
)

// Publish the rules as x-validonce on the component schema.
func (Signup) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return humaonce.Transform(signupRules, s)
}
```

Wrap the handler so a broken rule returns 422 before your code runs:

```go
huma.Post(api, "/signups", humaonce.Wrap(signupRules, func(ctx context.Context, in *struct{ Body Signup }) (*Out, error) {
	return &Out{}, nil
}))
```

Other builders: `AtLeastOneOf`, `ExactlyOneOf`, `AllOrNone`, and the conditions `Ne`, `In`, `Present`, `Absent`, `AllOf`, `AnyOf`, `Not`. Every builder takes `Key`, `Params`, `ID`, `Path` and `ServerOnly`.

## 3. What you get

`/openapi.json` has the rules under `components.schemas.Signup["x-validonce"]`. A request that breaks a rule gets 422 as `application/problem+json`, with the issues in a top-level `validonce` member (see "Transport" in the [rule format](rule-format-v1.md)):

```json
{"type": "about:blank", "title": "One or more validation errors occurred.", "status": 422,
 "validonce": [{"path": ["company"], "ruleId": "Signup.required_when.company",
                "key": "rules.company_required", "params": {}}]}
```

Rules run after Huma's own field validation succeeds. One response lists every failing rule. In the browser, `issuesFromProblemDetails` or `issuesFromResponse` from `validonce/server-errors` turns the body back into issues.

## With go-playground/validator

If you already call `validate.Struct`, register the rules once and they run with your field tags:

```go
v := validator.New()
playground.Register(v, signupRules, Signup{})

if err := v.Struct(body); err != nil {
	return playground.FromError(signupRules, err) // a 422 *validonce.Problem for rule failures
}
```

Each failing rule is a field error whose tag is the rule id; `playground.IssuesFromError` gives the issues back.

## Gotchas

- **Field names are JSON names.** Builders are keyed by the `json` tag (the wire name) and checked by reflection when `Build` runs: an unknown field, a `compare` on an unsupported Go type (a `bool`, a slice), or a duplicate id is an error at startup, not at request time.
- **Compare types come from the Go field.** Numbers compare as `number`, `string` fields as `string`, `time.Time` as `datetime`. Dates are strings with `format:"date"`; a string with `format:"date-time"` is a `datetime`. Pass `validonce.As("date")` when the tag is missing.
- **Use pointers for optional fields** (`*string`, `omitempty`), so a missing or `null` value reaches the rules as blank.
- Rules see the wire form: the struct is encoded with `encoding/json` and the resulting JSON object is evaluated.
- Ids default to `TypeName.kind.field`. Pass `ID(...)` on a collision.
- Release tags for this module are `go/vX.Y.Z`.

## Migrate with an agent

If your cross-field checks are go-playground/validator tags or `RegisterStructValidation` functions, an agent can move them. The [go-playground guide](../skills/validonce-migrate/references/go-playground.md) maps each check to a `validonce.MustBuild[T]` rule set, and `generate_code` with target `go` writes the struct and rules (notes cover Huma and the go-playground adapter). The Go runner runs the old validator on generated inputs. These need `validonce-mcp` 0.2.0 or later. See [Migrating with an agent](agentic-migration.md).

Next: the [React guide](client-react.md) or [Angular guide](client-angular.md). Runnable example: [examples/go-app](../examples/go-app/README.md).
