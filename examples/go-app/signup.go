// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package main

import (
	"github.com/danielgtaylor/huma/v2"

	validonce "github.com/metatoy/validonce/go"
	"github.com/metatoy/validonce/go/humaonce"
)

// Signup is the shared contract: the same fields and rules as the ASP.NET and FastAPI examples.
type Signup struct {
	Plan     string  `json:"plan" enum:"free,pro"`
	Company  *string `json:"company,omitempty" nullable:"true"`
	Email    string  `json:"email" minLength:"1"`
	Start    string  `json:"start" format:"date"`
	End      *string `json:"end,omitempty" format:"date" nullable:"true"`
	Quantity int32   `json:"quantity"`
}

var signupRules = validonce.MustBuild[Signup](
	validonce.When(validonce.Eq("plan", "pro")).Require("company",
		validonce.Key("rules.company_required"), validonce.ID("Signup.required_when.company")),
	validonce.Cmp("end").Ge(validonce.Ref("start"),
		validonce.Key("rules.end_after_start"), validonce.ID("Signup.compare.end")),
	validonce.Cmp("quantity").Ge(validonce.Val(1),
		validonce.Key("rules.quantity_min"), validonce.Params(map[string]any{"min": 1}),
		validonce.ID("Signup.compare.quantity")),
)

// TransformSchema publishes the rules as x-validonce on the Signup component schema.
func (Signup) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return humaonce.Transform(signupRules, s)
}
