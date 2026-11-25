// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Signup cross-field rules with go-playground/validator (no validonce).
// Copy over skills/validonce-migrate/scripts/run-go/model.go.
package main

import "github.com/go-playground/validator/v10"

// Plain strings: JSON null and a missing key decode to "", so required_if rejects all three blanks.
type Model struct {
	Plan     string   `json:"plan"`
	Company  string   `json:"company" validate:"required_if=Plan pro"`
	Email    string   `json:"email"`
	Start    string   `json:"start"`
	End      string   `json:"end"`
	Quantity *float64 `json:"quantity"`
}

func newModel() any { return &Model{} }

func register(v *validator.Validate) {
	v.RegisterStructValidation(func(sl validator.StructLevel) {
		m := sl.Current().Interface().(Model)
		// dates are YYYY-MM-DD: string order is date order. (gtefield on strings compares LENGTH, so it is not used.)
		if m.End != "" && m.Start != "" && m.End < m.Start {
			sl.ReportError(m.End, "end", "End", "gtedate", "")
		}
		if m.Quantity != nil && *m.Quantity < 1 {
			sl.ReportError(*m.Quantity, "quantity", "Quantity", "min1", "")
		}
	}, Model{})
}
