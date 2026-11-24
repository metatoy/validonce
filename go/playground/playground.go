// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Package playground runs validonce rules inside go-playground/validator, so they execute with
// the validation an application already has (validate.Struct, Echo, Gin, ...).
package playground

import (
	"errors"
	"reflect"
	"sort"
	"strings"
	"sync"

	"github.com/go-playground/validator/v10"

	validonce "github.com/metatoy/validonce/go"
)

// roots maps the key Register passes as the error param to the struct type being validated, so
// IssuesFromError can turn Go field names in a namespace into JSON names.
var roots sync.Map // string -> reflect.Type

func rootKey(t reflect.Type) string { return t.PkgPath() + "." + t.String() }

// Register adds a struct-level validation to v that runs rules on values of sample's type
// (pass a zero value, e.g. Signup{}). Each failing rule is reported as a field error whose tag is
// the rule id and whose field name is the issue path (the JSON name). Use IssuesFromError to turn
// the result back into validonce issues, or FromError for a ready problem details error.
//
// Register does not change v's configuration: a tag name function you registered keeps working.
// For nested values, the issue path is rebuilt from the error namespace, mapping each struct
// field to its JSON name by walking the types (see IssuesFromError).
func Register(v *validator.Validate, rules *validonce.Rules, sample any) {
	v.RegisterStructValidation(func(sl validator.StructLevel) {
		top := sl.Top().Type()
		for top.Kind() == reflect.Pointer {
			top = top.Elem()
		}
		key := rootKey(top)
		roots.Store(key, top)
		issues, err := rules.Check(sl.Current().Interface())
		if err != nil {
			sl.ReportError(sl.Current().Interface(), "", "", "validonce", key)
			return
		}
		for _, i := range issues {
			sl.ReportError(fieldValue(sl.Current(), i.Path[0]), i.Path[0], i.Path[0], i.RuleID, key)
		}
	}, sample)
}

// jsonName is the wire name of a struct field: its json tag, or the Go name when there is none
// or the tag is "-".
func jsonName(f reflect.StructField) string {
	name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
	if name == "" || name == "-" {
		return f.Name
	}
	return name
}

// splitNamespace (of the validator's StructNamespace, which uses Go field names even when a
// tag name function is set) splits "Order.items[0].company" into "Order", "items", "0", "company".
func splitNamespace(ns string) []string {
	var out []string
	var cur strings.Builder
	flush := func() {
		if cur.Len() > 0 {
			out = append(out, cur.String())
			cur.Reset()
		}
	}
	for i := 0; i < len(ns); i++ {
		switch ns[i] {
		case '.':
			flush()
		case '[':
			flush()
			end := strings.IndexByte(ns[i:], ']')
			if end < 0 {
				cur.WriteString(ns[i:])
				i = len(ns)
				break
			}
			out = append(out, ns[i+1:i+end])
			i += end
		default:
			cur.WriteByte(ns[i])
		}
	}
	flush()
	return out
}

func deref(t reflect.Type) reflect.Type {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	return t
}

// findField looks seg up in struct type t by Go name or JSON name, descending into embedded
// structs. It returns the field's JSON name, its type, and whether seg named an embedded struct
// whose fields are flattened into the parent on the wire (so it adds no path segment).
func findField(t reflect.Type, seg string) (name string, ft reflect.Type, embedded, ok bool) {
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		tag, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		if f.Anonymous && tag == "" && deref(f.Type).Kind() == reflect.Struct {
			if f.Name == seg {
				return "", deref(f.Type), true, true
			}
			continue
		}
		if f.Name == seg || jsonName(f) == seg {
			return jsonName(f), f.Type, false, true
		}
	}
	return "", nil, false, false
}

// pathFromNamespace maps a validator namespace to a wire path: the root type is dropped, struct
// fields become JSON names, and indexes and map keys pass through as their own segments.
func pathFromNamespace(ns string, root reflect.Type) []string {
	segs := splitNamespace(ns)
	if len(segs) == 0 {
		return nil
	}
	segs = segs[1:]
	out := make([]string, 0, len(segs))
	cur := root
	for _, seg := range segs {
		if cur == nil {
			out = append(out, seg)
			continue
		}
		switch t := deref(cur); t.Kind() {
		case reflect.Struct:
			name, ft, embedded, ok := findField(t, seg)
			switch {
			case !ok:
				out = append(out, seg)
				cur = nil
			case embedded:
				cur = ft
			default:
				out = append(out, name)
				cur = ft
			}
		case reflect.Slice, reflect.Array, reflect.Map:
			out = append(out, seg)
			cur = t.Elem()
		default:
			out = append(out, seg)
			cur = nil
		}
	}
	return out
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
		var root reflect.Type
		if t, ok := roots.Load(fe.Param()); ok {
			root = t.(reflect.Type)
		}
		out = append(out, validonce.Issue{Path: pathFromNamespace(fe.StructNamespace(), root), RuleID: r.ID, Key: r.Message.Key, Params: params})
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
