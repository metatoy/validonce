// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Package humaonce connects validonce rules to Huma (github.com/danielgtaylor/huma/v2): it adds
// x-validonce to a type's OpenAPI component schema and turns failing rules into a 422 RFC 9457
// problem details response with a top-level "validonce" member.
package humaonce

import (
	"context"
	"fmt"
	"reflect"

	"github.com/danielgtaylor/huma/v2"

	validonce "github.com/metatoy/validonce/go"
)

// Extension is the OpenAPI schema key the rules are published under.
const Extension = "x-validonce"

// Transform adds the rules to a schema. Call it from the body type's TransformSchema method, so
// Huma applies it to the component schema when the type is registered:
//
//	func (Signup) TransformSchema(r huma.Registry, s *huma.Schema) *huma.Schema {
//		return humaonce.Transform(signupRules, s)
//	}
func Transform(rules *validonce.Rules, s *huma.Schema) *huma.Schema {
	if s.Extensions == nil {
		s.Extensions = map[string]any{}
	}
	s.Extensions[Extension] = rules.Set()
	return s
}

// Annotate adds the rules to an already registered component schema, named by the rules' type
// name. Use it instead of Transform when the body type cannot have methods; call it after the
// operations that use the type are registered.
func Annotate(api huma.API, rules ...*validonce.Rules) error {
	schemas := api.OpenAPI().Components.Schemas.Map()
	for _, r := range rules {
		s, ok := schemas[r.Model()]
		if !ok {
			return fmt.Errorf("humaonce: no component schema %q; register the operation first", r.Model())
		}
		Transform(r, s)
	}
	return nil
}

// Wrap returns a handler that checks the request's Body field against rules before calling h. A
// failing rule set returns the 422 problem details error and h is not called. I must be a struct
// with a Body field (a struct or a pointer to one), the usual shape of a Huma input. It panics at
// call time if I has no such field, which surfaces at startup when used with huma.Register.
func Wrap[I, O any](rules *validonce.Rules, h func(context.Context, *I) (*O, error)) func(context.Context, *I) (*O, error) {
	t := reflect.TypeFor[I]()
	if t.Kind() != reflect.Struct {
		panic("humaonce: input type " + t.String() + " is not a struct")
	}
	if _, ok := t.FieldByName("Body"); !ok {
		panic("humaonce: input type " + t.String() + " has no Body field")
	}
	return func(ctx context.Context, in *I) (*O, error) {
		body := reflect.ValueOf(in).Elem().FieldByName("Body")
		if body.Kind() == reflect.Pointer && body.IsNil() {
			return h(ctx, in)
		}
		if err := rules.Problem(body.Interface()); err != nil {
			return nil, err
		}
		return h(ctx, in)
	}
}

// Problem returns rules' problem details error for v, or nil. Use it directly in a handler when
// Wrap does not fit.
func Problem(rules *validonce.Rules, v any) error { return rules.Problem(v) }
