// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Package validonce evaluates and builds validonce rule sets (rule format v1).
//
// Rules are data: the same JSON that the C#, Python and TypeScript implementations export under
// "x-validonce". Evaluate runs them against the wire form of an object (a decoded JSON map).
package validonce

import (
	"encoding/json"
	"fmt"
)

// Kind names a rule kind.
type Kind string

// The five rule kinds of format v1.
const (
	KindRequiredWhen Kind = "required_when"
	KindCompare      Kind = "compare"
	KindAtLeastOneOf Kind = "at_least_one_of"
	KindExactlyOneOf Kind = "exactly_one_of"
	KindAllOrNone    Kind = "all_or_none"
)

// Version is the rule format version this package implements.
const Version = 1

// Message is the text key (and optional params) a failing rule reports.
type Message struct {
	Key    string         `json:"key"`
	Params map[string]any `json:"params,omitempty"`
}

// FieldValue is the {field, value} pair used by eq, ne and in conditions.
type FieldValue struct {
	Field string `json:"field"`
	Value any    `json:"value"`
}

// FieldValues is the {field, values} pair used by "in".
type FieldValues struct {
	Field  string `json:"field"`
	Values []any  `json:"values"`
}

// FieldRef names one field.
type FieldRef struct {
	Field string `json:"field"`
}

// Condition is a condition tree; exactly one member is set.
type Condition struct {
	Eq      *FieldValue  `json:"eq,omitempty"`
	Ne      *FieldValue  `json:"ne,omitempty"`
	In      *FieldValues `json:"in,omitempty"`
	Present *FieldRef    `json:"present,omitempty"`
	Absent  *FieldRef    `json:"absent,omitempty"`
	All     []Condition  `json:"all,omitempty"`
	Any     []Condition  `json:"any,omitempty"`
	Not     *Condition   `json:"not,omitempty"`
}

// Operand is one side of a compare: a field reference or a constant.
type Operand struct {
	Field    string
	Value    any
	HasValue bool
}

// MarshalJSON writes {"field": ...} or {"value": ...}.
func (o Operand) MarshalJSON() ([]byte, error) {
	if o.HasValue {
		return json.Marshal(struct {
			Value any `json:"value"`
		}{o.Value})
	}
	return json.Marshal(FieldRef{o.Field})
}

// UnmarshalJSON reads {"field": ...} or {"value": ...}.
func (o *Operand) UnmarshalJSON(b []byte) error {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return err
	}
	f, hasField := m["field"]
	v, hasValue := m["value"]
	if hasField == hasValue || len(m) != 1 {
		return fmt.Errorf("operand needs exactly one of field or value")
	}
	*o = Operand{}
	if hasField {
		return json.Unmarshal(f, &o.Field)
	}
	o.HasValue = true
	return json.Unmarshal(v, &o.Value)
}

// Rule is one rule of any kind. Only the members of its kind are used.
type Rule struct {
	ID         string     `json:"id"`
	Kind       Kind       `json:"kind"`
	Path       string     `json:"path,omitempty"`
	Field      string     `json:"field,omitempty"`
	When       *Condition `json:"when,omitempty"`
	Left       *Operand   `json:"left,omitempty"`
	Op         string     `json:"op,omitempty"`
	Right      *Operand   `json:"right,omitempty"`
	Type       string     `json:"type,omitempty"`
	Fields     []string   `json:"fields,omitempty"`
	Message    Message    `json:"message"`
	ServerOnly bool       `json:"server_only,omitempty"`
}

// RuleSet is the value of "x-validonce".
type RuleSet struct {
	Version int    `json:"version"`
	Rules   []Rule `json:"rules"`
}

// Issue is one failing rule, in the shape every implementation shares.
type Issue struct {
	Path   []string       `json:"path"`
	RuleID string         `json:"ruleId"`
	Key    string         `json:"key"`
	Params map[string]any `json:"params"`
}

// ParseRuleSet decodes and validates a rule set. Unknown versions, kinds and malformed rules are
// rejected, never skipped.
func ParseRuleSet(data []byte) (RuleSet, error) {
	var rs RuleSet
	if err := json.Unmarshal(data, &rs); err != nil {
		return RuleSet{}, fmt.Errorf("validonce: %w", err)
	}
	if err := rs.Validate(); err != nil {
		return RuleSet{}, err
	}
	return rs, nil
}

// Validate checks the rule set against the structure rule format v1 requires.
func (rs RuleSet) Validate() error {
	if rs.Version != Version {
		return fmt.Errorf("validonce: unsupported rule format version %d", rs.Version)
	}
	return ValidateRules(rs.Rules)
}

var ops = map[string]bool{"lt": true, "le": true, "gt": true, "ge": true, "eq": true, "ne": true}
var types = map[string]bool{"number": true, "string": true, "date": true, "datetime": true}

// ValidateRules checks the structure of rules (kind-specific members, ops, types, conditions).
func ValidateRules(rules []Rule) error {
	for _, r := range rules {
		if r.ID == "" || r.Message.Key == "" {
			return fmt.Errorf("validonce: rule needs id and message.key")
		}
		switch r.Kind {
		case KindRequiredWhen:
			if r.Field == "" || r.When == nil {
				return fmt.Errorf("validonce: required_when rule %q needs field and when", r.ID)
			}
			if err := checkCondition(*r.When, "rule "+r.ID+" when"); err != nil {
				return err
			}
		case KindCompare:
			if r.Left == nil || r.Left.HasValue || r.Left.Field == "" {
				return fmt.Errorf("validonce: compare rule %q needs left.field", r.ID)
			}
			if !ops[r.Op] {
				return fmt.Errorf("validonce: compare rule %q: unknown op %q", r.ID, r.Op)
			}
			if !types[r.Type] {
				return fmt.Errorf("validonce: compare rule %q: unknown type %q", r.ID, r.Type)
			}
			if r.Right == nil || (!r.Right.HasValue && r.Right.Field == "") {
				return fmt.Errorf("validonce: compare rule %q needs right", r.ID)
			}
			if r.Right.HasValue {
				if _, ok := scalar(r.Right.Value); !ok {
					return fmt.Errorf("validonce: compare rule %q: right.value must be a string, number or boolean", r.ID)
				}
			}
		case KindAtLeastOneOf, KindExactlyOneOf, KindAllOrNone:
			seen := map[string]bool{}
			for _, f := range r.Fields {
				seen[f] = true
			}
			if len(r.Fields) < 2 || len(seen) != len(r.Fields) {
				return fmt.Errorf("validonce: %s rule %q needs at least two distinct fields", r.Kind, r.ID)
			}
		default:
			return fmt.Errorf("validonce: rule %q has unknown kind %q", r.ID, r.Kind)
		}
	}
	return nil
}

func checkCondition(c Condition, where string) error {
	n := 0
	var err error
	if c.Eq != nil {
		n++
		if _, ok := scalar(c.Eq.Value); !ok || c.Eq.Field == "" {
			err = fmt.Errorf("validonce: %s.eq needs field and a string, number or boolean value", where)
		}
	}
	if c.Ne != nil {
		n++
		if _, ok := scalar(c.Ne.Value); !ok || c.Ne.Field == "" {
			err = fmt.Errorf("validonce: %s.ne needs field and a string, number or boolean value", where)
		}
	}
	if c.In != nil {
		n++
		if c.In.Field == "" {
			err = fmt.Errorf("validonce: %s.in needs field", where)
		}
		for _, v := range c.In.Values {
			if _, ok := scalar(v); !ok {
				err = fmt.Errorf("validonce: %s.in values must be strings, numbers or booleans", where)
			}
		}
	}
	if c.Present != nil {
		n++
		if c.Present.Field == "" {
			err = fmt.Errorf("validonce: %s.present needs field", where)
		}
	}
	if c.Absent != nil {
		n++
		if c.Absent.Field == "" {
			err = fmt.Errorf("validonce: %s.absent needs field", where)
		}
	}
	for name, list := range map[string][]Condition{"all": c.All, "any": c.Any} {
		if list != nil {
			n++
			if len(list) == 0 {
				err = fmt.Errorf("validonce: %s.%s needs a non-empty array of conditions", where, name)
			}
			for _, x := range list {
				if e := checkCondition(x, where+"."+name); e != nil {
					err = e
				}
			}
		}
	}
	if c.Not != nil {
		n++
		if e := checkCondition(*c.Not, where+".not"); e != nil {
			err = e
		}
	}
	if err != nil {
		return err
	}
	if n != 1 {
		return fmt.Errorf("validonce: %s: a condition has exactly one key", where)
	}
	return nil
}
