// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Package signup is the request model and HTTP handler of POST /signups.
package signup

import (
	"reflect"
	"strings"

	"github.com/go-playground/validator/v10"
)

// Signup is the request body. Dates are YYYY-MM-DD.
type Signup struct {
	Plan     string  `json:"plan" validate:"required,oneof=free pro"`
	Company  *string `json:"company,omitempty" validate:"-"`
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
	v.RegisterStructValidation(validateSignup, Signup{})
	return v
}

func validateSignup(sl validator.StructLevel) {
	s := sl.Current().Interface().(Signup)
	if s.Plan == "pro" && (s.Company == nil || *s.Company == "") {
		sl.ReportError(s.Company, "company", "Company", "company_required", "")
	}
	if s.End != nil && *s.End != "" && s.Start != "" && *s.End < s.Start {
		sl.ReportError(s.End, "end", "End", "end_after_start", "")
	}
}
