// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package validonce

import (
	"encoding/json"
	"fmt"
)

// Rules is a validated rule set bound to one Go struct type. Field names in the rules are the
// JSON names of the struct's fields (its `json` tags), the wire names the format uses.
type Rules struct {
	model string
	set   RuleSet
}

// Model returns the struct's type name, the prefix of default rule ids.
func (r *Rules) Model() string { return r.model }

// Set returns the rules as data, ready to be written under "x-validonce".
func (r *Rules) Set() RuleSet { return r.set }

// Evaluate runs the rules on the wire form of an object (a decoded JSON map).
func (r *Rules) Evaluate(data map[string]any, side Side) []Issue {
	return Evaluate(r.set.Rules, data, side)
}

// Check marshals v to its wire form with encoding/json and evaluates the rules on the server side.
func (r *Rules) Check(v any) ([]Issue, error) {
	return r.CheckSide(v, Server)
}

// CheckSide is Check for a chosen side.
func (r *Rules) CheckSide(v any, side Side) ([]Issue, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("validonce: %w", err)
	}
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, fmt.Errorf("validonce: %s does not encode as a JSON object: %w", r.model, err)
	}
	return r.Evaluate(data, side), nil
}

// Rule returns the rule with the given id.
func (r *Rules) Rule(id string) (Rule, bool) {
	for _, x := range r.set.Rules {
		if x.ID == id {
			return x, true
		}
	}
	return Rule{}, false
}

// ---------------------------------------------------------------------------------------------
// Builder inputs

// Builder is one rule under construction. Create them with When, Cmp, AtLeastOneOf and friends.
type Builder interface {
	draft() *draft
}

type draft struct {
	rule Rule
	typ  string // explicit compare type from As
}

func (d *draft) apply(opts []Option) *draft {
	for _, o := range opts {
		o(d)
	}
	return d
}

func (d *draft) draft() *draft { return d }

// Option customises a rule.
type Option func(*draft)

// Key sets the message key (required, e.g. "rules.company_required").
func Key(key string) Option { return func(d *draft) { d.rule.Message.Key = key } }

// Params sets the message params (strings, numbers, booleans or nil).
func Params(p map[string]any) Option { return func(d *draft) { d.rule.Message.Params = p } }

// ID sets the rule id; the default is TypeName.kind.field.
func ID(id string) Option { return func(d *draft) { d.rule.ID = id } }

// Path sets the field the issue is reported on.
func Path(p string) Option { return func(d *draft) { d.rule.Path = p } }

// ServerOnly makes clients skip the rule.
func ServerOnly() Option { return func(d *draft) { d.rule.ServerOnly = true } }

// As sets the compare type ("number", "string", "date" or "datetime") when it cannot be inferred
// from the Go field type.
func As(t string) Option { return func(d *draft) { d.typ = t } }

// Cond is a condition under construction.
type Cond struct{ c Condition }

// Eq is true when the field strictly equals value.
func Eq(field string, value any) Cond { return Cond{Condition{Eq: &FieldValue{field, value}}} }

// Ne is true when Eq would be false.
func Ne(field string, value any) Cond { return Cond{Condition{Ne: &FieldValue{field, value}}} }

// In is true when the field equals one of values.
func In(field string, values ...any) Cond {
	return Cond{Condition{In: &FieldValues{field, values}}}
}

// Present is true when the field is not blank.
func Present(field string) Cond { return Cond{Condition{Present: &FieldRef{field}}} }

// Absent is true when the field is blank.
func Absent(field string) Cond { return Cond{Condition{Absent: &FieldRef{field}}} }

// AllOf is true when every condition is.
func AllOf(cs ...Cond) Cond { return Cond{Condition{All: conds(cs)}} }

// AnyOf is true when at least one condition is.
func AnyOf(cs ...Cond) Cond { return Cond{Condition{Any: conds(cs)}} }

// Not negates a condition.
func Not(c Cond) Cond { x := c.c; return Cond{Condition{Not: &x}} }

func conds(cs []Cond) []Condition {
	out := make([]Condition, len(cs))
	for i, c := range cs {
		out[i] = c.c
	}
	return out
}

// WhenBuilder is the first half of a required_when rule.
type WhenBuilder struct{ c Cond }

// When starts a required_when rule.
func When(c Cond) WhenBuilder { return WhenBuilder{c} }

// Require finishes it: field must not be blank when the condition holds.
func (w WhenBuilder) Require(field string, opts ...Option) Builder {
	cond := w.c.c
	d := &draft{rule: Rule{Kind: KindRequiredWhen, Field: field, When: &cond}}
	return d.apply(opts)
}

// Operand constructors for Compare rules.

// Ref compares against another field.
func Ref(field string) Operand { return Operand{Field: field} }

// Val compares against a constant (string, number or boolean).
func Val(v any) Operand {
	if n, ok := scalar(v); ok {
		v = n // all numbers are float64, as they are on the wire
	}
	return Operand{Value: v, HasValue: true}
}

// CmpBuilder is the first half of a compare rule.
type CmpBuilder struct{ field string }

// Cmp starts a compare rule with field on the left.
func Cmp(field string) CmpBuilder { return CmpBuilder{field} }

func (c CmpBuilder) op(op string, right Operand, opts []Option) Builder {
	l := Operand{Field: c.field}
	d := &draft{rule: Rule{Kind: KindCompare, Left: &l, Op: op, Right: &right}}
	return d.apply(opts)
}

// Lt, Le, Gt, Ge, Eq and Ne finish a compare rule.
func (c CmpBuilder) Lt(r Operand, opts ...Option) Builder { return c.op("lt", r, opts) }

// Le is "less than or equal".
func (c CmpBuilder) Le(r Operand, opts ...Option) Builder { return c.op("le", r, opts) }

// Gt is "greater than".
func (c CmpBuilder) Gt(r Operand, opts ...Option) Builder { return c.op("gt", r, opts) }

// Ge is "greater than or equal".
func (c CmpBuilder) Ge(r Operand, opts ...Option) Builder { return c.op("ge", r, opts) }

// Eq is "equal".
func (c CmpBuilder) Eq(r Operand, opts ...Option) Builder { return c.op("eq", r, opts) }

// Ne is "not equal".
func (c CmpBuilder) Ne(r Operand, opts ...Option) Builder { return c.op("ne", r, opts) }

func group(kind Kind, fields []string, opts []Option) Builder {
	d := &draft{rule: Rule{Kind: kind, Fields: append([]string(nil), fields...)}}
	return d.apply(opts)
}

// AtLeastOneOf fails when every field is blank.
func AtLeastOneOf(fields []string, opts ...Option) Builder {
	return group(KindAtLeastOneOf, fields, opts)
}

// ExactlyOneOf fails unless exactly one field is not blank.
func ExactlyOneOf(fields []string, opts ...Option) Builder {
	return group(KindExactlyOneOf, fields, opts)
}

// AllOrNone fails when some, but not all, fields are blank.
func AllOrNone(fields []string, opts ...Option) Builder { return group(KindAllOrNone, fields, opts) }
