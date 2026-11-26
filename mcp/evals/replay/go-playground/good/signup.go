// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Package signup is the request model and HTTP handler of POST /signups.
package signup

import (
	"reflect"
	"strings"

	"github.com/go-playground/validator/v10"

	validonce "github.com/metatoy/validonce/go"
	"github.com/metatoy/validonce/go/playground"
)

// Signup is the request body. Dates are YYYY-MM-DD.
type Signup struct {
	Plan     string  `json:"plan" validate:"required,oneof=free pro"`
	Company  *string `json:"company,omitempty"`
	Email    string  `json:"email" validate:"required"`
	Start    string  `json:"start" validate:"required,datetime=2006-01-02"`
	End      *string `json:"end,omitempty" validate:"omitempty,datetime=2006-01-02"`
	Quantity int64   `json:"quantity" validate:"gte=1"`
}

// NewValidator returns the validator the handler uses. Errors name JSON fields.
func NewValidator() *validator.Validate {
	v := validator.New(validator.WithRequiredStructEnabled())
	v.RegisterTagNameFunc(func(f reflect.StructField) string {
		return strings.SplitN(f.Tag.Get("json"), ",", 2)[0]
	})
	playground.Register(v, signupRules, Signup{})
	return v
}

var signupRules = validonce.MustBuild[Signup](
	validonce.When(validonce.Eq("plan", "pro")).Require("company", validonce.Key("rules.company_required")),
	validonce.Cmp("end").Ge(validonce.Ref("start"), validonce.Key("rules.end_after_start"), validonce.As("date")),
	validonce.Cmp("quantity").Ge(validonce.Val(1), validonce.Key("rules.quantity_min"), validonce.Params(map[string]any{"min": 1})),
)
