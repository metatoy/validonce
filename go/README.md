# validonce for Go

Write cross-field validation rules once, next to a Go struct. The server enforces them, [Huma](https://huma.rocks) publishes them in the OpenAPI document under `x-validonce`, and browser forms (React, Angular, Vue, plain HTML) enforce the same rules.

## Install

```sh
go get github.com/metatoy/validonce/go
```

Needs Go 1.26 or later. The core package has no dependencies beyond the standard library. `github.com/metatoy/validonce/go/humaonce` adds Huma, and `github.com/metatoy/validonce/go/playground` adds go-playground/validator.

## Example

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

A request that breaks a rule gets 422 as `application/problem+json`, with the issues in a top-level `validonce` member. The full walk-through, including go-playground/validator, is in [Getting started: Go](https://github.com/metatoy/validonce/blob/main/docs/getting-started-go.md).

## Links

- [Getting started: Go](https://github.com/metatoy/validonce/blob/main/docs/getting-started-go.md)
- [Rule format v1](https://github.com/metatoy/validonce/blob/main/docs/rule-format-v1.md)
- [Migrating an existing project with an agent](https://github.com/metatoy/validonce/blob/main/docs/agentic-migration.md): the `validonce-mcp` server and skill can move go-playground/validator checks to these rules (needs `validonce-mcp` 0.2.0 or later)
- [Playground](https://playground.metatoy.com)
- [Repository](https://github.com/metatoy/validonce)

Release tags for this module are `go/vX.Y.Z`.

## License

Copyright 2026 Metatoy LLC. Licensed under the Apache License, Version 2.0 (see `LICENSE` and `NOTICE`).
