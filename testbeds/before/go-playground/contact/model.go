// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// "Before" fixture: the Contact cross-field rules with go-playground/validator (no validonce).
// Copy over skills/validonce-migrate/scripts/run-go/model.go.
package main

import "github.com/go-playground/validator/v10"

type Model struct {
	Email         string `json:"email" validate:"required_without=Phone"`
	Phone         string `json:"phone"`
	Street        string `json:"street"`
	City          string `json:"city"`
	PostalCode    string `json:"postalCode" validate:"required_if=Country US"`
	Country       string `json:"country"`
	AvailableFrom string `json:"availableFrom"`
	AvailableTo   string `json:"availableTo"`
}

func newModel() any { return &Model{} }

func register(v *validator.Validate) {
	v.RegisterStructValidation(func(sl validator.StructLevel) {
		m := sl.Current().Interface().(Model)
		set := 0
		for _, s := range []string{m.Street, m.City, m.PostalCode} {
			if s != "" {
				set++
			}
		}
		if set != 0 && set != 3 {
			sl.ReportError(m.Street, "street", "Street", "all_or_none", "")
		}
		if m.AvailableTo != "" && m.AvailableFrom != "" && m.AvailableTo < m.AvailableFrom {
			sl.ReportError(m.AvailableTo, "availableTo", "AvailableTo", "gtedate", "")
		}
	}, Model{})
}
