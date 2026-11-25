// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// The old validator: replace this file with the user's struct and struct-level validators.
// Keep only the checks being migrated (the cross-field rules); field-level tags such as
// required or oneof would show up as divergences, because the generated inputs do not honor them.
// json tags must carry the wire names. Optional fields are pointers so null and missing differ from "".
package main

import "github.com/go-playground/validator/v10"

type Model struct {
	Name *string `json:"name"`
}

func newModel() any { return &Model{} }

func register(v *validator.Validate) {
	// v.RegisterStructValidation(func(sl validator.StructLevel) { ... sl.ReportError(value, "wireName", "GoName", "tag", "") }, Model{})
}
