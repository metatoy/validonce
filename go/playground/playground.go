// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Package playground runs validonce rules inside go-playground/validator, so they execute with
// the validation an application already has (validate.Struct, Echo, Gin, ...).
package playground

import (
	"errors"
	"reflect"
	"sort"

	"github.com/go-playground/validator/v10"

	validonce "github.com/metatoy/validonce/go"
)

// Register adds a struct-level validation to v that runs rules on values of sample's type
// (pass a zero value, e.g. Signup{}). Each failing rule is reported as a field error whose tag is
// the rule id and whose field name is the issue path (the JSON name). Use IssuesFromError to turn
// the result back into validonce issues, or FromError for a ready problem details error.
func Register(v *validator.Validate, rules *validonce.Rules, sample any) {
	v.RegisterStructValidation(func(sl validator.StructLevel) {
		issues, err := rules.Check(sl.Current().Interface())
		if err != nil {
			sl.ReportError(sl.Current().Interface(), "", "", "validonce", "")
			return
		}
		for _, i := range issues {
			sl.ReportError(fieldValue(sl.Current(), i.Path[0]), i.Path[0], i.Path[0], i.RuleID, "")
		}
	}, sample)
}

// fieldValue is only used so the error carries a value; the JSON name need not match a Go field.
func fieldValue(v reflect.Value, name string) any {
	if v.Kind() == reflect.Struct {
		if f := v.FieldByName(name); f.IsValid() && f.CanInterface() {
			return f.Interface()
		}
	}
	return nil
}

// IssuesFromError maps the errors validate.Struct returned back to validonce issues, in the
// order the validator reported them. Errors for other tags (the application's own field rules)
// are skipped; the second result is false when err holds no validonce rule failure.
func IssuesFromError(rules *validonce.Rules, err error) ([]validonce.Issue, bool) {
	var ves validator.ValidationErrors
	if !errors.As(err, &ves) {
		return nil, false
	}
	var out []validonce.Issue
	for _, fe := range ves {
		r, ok := rules.Rule(fe.Tag())
		if !ok {
			continue
		}
		params := map[string]any{}
		for k, val := range r.Message.Params {
			params[k] = val
		}
		out = append(out, validonce.Issue{Path: []string{fe.Field()}, RuleID: r.ID, Key: r.Message.Key, Params: params})
	}
	// The validator reports struct-level errors in registration order, which is rule order; keep
	// it stable regardless by sorting on the rule's position.
	pos := map[string]int{}
	for i, r := range rules.Set().Rules {
		pos[r.ID] = i
	}
	sort.SliceStable(out, func(i, j int) bool { return pos[out[i].RuleID] < pos[out[j].RuleID] })
	return out, len(out) > 0
}

// FromError returns a *validonce.Problem (422) when err holds validonce rule failures, else err
// unchanged (nil stays nil).
func FromError(rules *validonce.Rules, err error) error {
	if err == nil {
		return nil
	}
	if issues, ok := IssuesFromError(rules, err); ok {
		return validonce.NewProblem(issues, 0)
	}
	return err
}
