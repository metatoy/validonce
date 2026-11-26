// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Package order is the order request model.
package order

import "github.com/go-playground/validator/v10"

// Order amounts are in cents.
type Order struct {
	Subtotal int64 `json:"subtotal" validate:"gte=0"`
	Tax      int64 `json:"tax" validate:"gte=0"`
	Total    int64 `json:"total" validate:"gte=0"`
}

// NewValidator returns the validator the handlers use.
func NewValidator() *validator.Validate {
	v := validator.New(validator.WithRequiredStructEnabled())
	v.RegisterStructValidation(func(sl validator.StructLevel) {
		o := sl.Current().Interface().(Order)
		if o.Subtotal+o.Tax != o.Total {
			sl.ReportError(o.Total, "total", "Total", "order_total", "")
		}
	}, Order{})
	return v
}
