// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package validonce

import (
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"
)

// Build turns builders into a validated Rules for struct type T. It checks, by reflection, that
// every field a rule names is a JSON field of T, that compare types are supported and match the
// Go field types, and that rule ids are unique. Call it once at startup; every problem is
// reported together.
func Build[T any](builders ...Builder) (*Rules, error) {
	t := reflect.TypeFor[T]()
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct {
		return nil, fmt.Errorf("validonce: %s is not a struct type", t)
	}
	m := &model{name: t.Name(), fields: map[string]fieldInfo{}}
	if m.name == "" {
		return nil, fmt.Errorf("validonce: %s is an unnamed type; rule ids need a type name", t)
	}
	m.collect(t, nil)

	var errs []error
	seen := map[string]bool{}
	rules := make([]Rule, 0, len(builders))
	for _, b := range builders {
		d := b.draft()
		r, err := m.finish(d)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		if seen[r.ID] {
			errs = append(errs, fmt.Errorf("validonce: %s: rule id %q is used twice; pass ID(...) to one of them", m.name, r.ID))
			continue
		}
		seen[r.ID] = true
		rules = append(rules, r)
	}
	if len(errs) > 0 {
		return nil, errors.Join(errs...)
	}
	set := RuleSet{Version: Version, Rules: rules}
	if err := set.Validate(); err != nil {
		return nil, err
	}
	return &Rules{model: m.name, set: set}, nil
}

// MustBuild is Build that panics, for package-level variables.
func MustBuild[T any](builders ...Builder) *Rules {
	r, err := Build[T](builders...)
	if err != nil {
		panic(err)
	}
	return r
}

type fieldInfo struct {
	typ    reflect.Type
	format string // the `format` struct tag (Huma / JSON Schema), if any
}

type model struct {
	name   string
	fields map[string]fieldInfo
}

func (m *model) collect(t reflect.Type, seen map[reflect.Type]bool) {
	if seen == nil {
		seen = map[reflect.Type]bool{}
	}
	if seen[t] {
		return
	}
	seen[t] = true
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		tag, hasTag := f.Tag.Lookup("json")
		name, _, _ := strings.Cut(tag, ",")
		if tag == "-" {
			continue
		}
		if f.Anonymous && name == "" {
			ft := f.Type
			for ft.Kind() == reflect.Pointer {
				ft = ft.Elem()
			}
			if ft.Kind() == reflect.Struct {
				m.collect(ft, seen)
				continue
			}
		}
		if !f.IsExported() {
			continue
		}
		if name == "" {
			name = f.Name
		}
		_ = hasTag
		if _, dup := m.fields[name]; !dup {
			m.fields[name] = fieldInfo{typ: f.Type, format: f.Tag.Get("format")}
		}
	}
}

func (m *model) names() string {
	n := make([]string, 0, len(m.fields))
	for k := range m.fields {
		n = append(n, k)
	}
	sort.Strings(n)
	return strings.Join(n, ", ")
}

func (m *model) need(id, field string) (fieldInfo, error) {
	fi, ok := m.fields[field]
	if !ok {
		return fi, fmt.Errorf("validonce: %s: rule %s names unknown field %q (JSON fields: %s)", m.name, id, field, m.names())
	}
	return fi, nil
}

// inferType maps a Go field to a compare type, or "" when it has none.
func (fi fieldInfo) inferType() string {
	t := fi.typ
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == reflect.TypeFor[time.Time]() {
		return "datetime"
	}
	switch t.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number"
	case reflect.String:
		switch fi.format {
		case "date":
			return "date"
		case "date-time":
			return "datetime"
		}
		return "string"
	}
	return ""
}

func (fi fieldInfo) allows(typ string) bool {
	t := fi.typ
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	inferred := fi.inferType()
	switch typ {
	case "number":
		return inferred == "number"
	case "string":
		return inferred == "string"
	case "date", "datetime":
		// A string field may carry either; time.Time always marshals as a datetime.
		return t.Kind() == reflect.String || (typ == "datetime" && t == reflect.TypeFor[time.Time]())
	}
	return false
}

func (m *model) finish(d *draft) (Rule, error) {
	r := d.rule
	r.Fields = append([]string(nil), r.Fields...)
	path := ""
	switch r.Kind {
	case KindRequiredWhen:
		path = r.Field
	case KindCompare:
		path = r.Left.Field
	default:
		if len(r.Fields) > 0 {
			path = r.Fields[0]
		}
	}
	if r.Path != "" {
		path = r.Path
	}
	if r.ID == "" {
		r.ID = fmt.Sprintf("%s.%s.%s", m.name, r.Kind, path)
	}
	id := r.ID
	if r.Message.Key == "" {
		return r, fmt.Errorf("validonce: %s: rule %s has no message key; pass Key(...)", m.name, id)
	}
	for k, v := range r.Message.Params {
		if v == nil {
			continue
		}
		n, ok := scalar(v)
		if !ok {
			return r, fmt.Errorf("validonce: %s: rule %s: param %q must be a string, number, boolean or nil", m.name, id, k)
		}
		r.Message.Params[k] = n
	}
	if r.Path != "" {
		if _, err := m.need(id, r.Path); err != nil {
			return r, err
		}
	}
	switch r.Kind {
	case KindRequiredWhen:
		if _, err := m.need(id, r.Field); err != nil {
			return r, err
		}
		if err := m.checkCond(id, *r.When); err != nil {
			return r, err
		}
	case KindCompare:
		l, err := m.need(id, r.Left.Field)
		if err != nil {
			return r, err
		}
		typ := d.typ
		if typ == "" {
			typ = l.inferType()
		}
		if typ == "" {
			return r, fmt.Errorf("validonce: %s: rule %s: compare is not supported on field %q of Go type %s (use numbers, strings, dates or time.Time)", m.name, id, r.Left.Field, l.typ)
		}
		if !l.allows(typ) {
			return r, fmt.Errorf("validonce: %s: rule %s: field %q (Go type %s) cannot be compared as %q", m.name, id, r.Left.Field, l.typ, typ)
		}
		if r.Right.HasValue {
			v, ok := scalar(r.Right.Value)
			if !ok {
				return r, fmt.Errorf("validonce: %s: rule %s: compare constant must be a string, number or boolean", m.name, id)
			}
			_, isStr := v.(string)
			if (typ == "number") == isStr {
				return r, fmt.Errorf("validonce: %s: rule %s: constant %v does not fit compare type %q", m.name, id, v, typ)
			}
			if _, isBool := v.(bool); isBool {
				return r, fmt.Errorf("validonce: %s: rule %s: a boolean cannot be compared", m.name, id)
			}
			r.Right = &Operand{Value: v, HasValue: true}
		} else {
			rt, err := m.need(id, r.Right.Field)
			if err != nil {
				return r, err
			}
			if !rt.allows(typ) {
				return r, fmt.Errorf("validonce: %s: rule %s: field %q (Go type %s) cannot be compared as %q", m.name, id, r.Right.Field, rt.typ, typ)
			}
		}
		r.Type = typ
	default:
		for _, f := range r.Fields {
			if _, err := m.need(id, f); err != nil {
				return r, err
			}
		}
	}
	return r, nil
}

func (m *model) checkCond(id string, c Condition) error {
	var fields []string
	switch {
	case c.Eq != nil:
		fields = []string{c.Eq.Field}
		n, ok := scalar(c.Eq.Value)
		if !ok {
			return fmt.Errorf("validonce: %s: rule %s: eq value must be a string, number or boolean", m.name, id)
		}
		c.Eq.Value = n
	case c.Ne != nil:
		fields = []string{c.Ne.Field}
		n, ok := scalar(c.Ne.Value)
		if !ok {
			return fmt.Errorf("validonce: %s: rule %s: ne value must be a string, number or boolean", m.name, id)
		}
		c.Ne.Value = n
	case c.In != nil:
		fields = []string{c.In.Field}
		for i, v := range c.In.Values {
			n, ok := scalar(v)
			if !ok {
				return fmt.Errorf("validonce: %s: rule %s: in values must be strings, numbers or booleans", m.name, id)
			}
			c.In.Values[i] = n
		}
	case c.Present != nil:
		fields = []string{c.Present.Field}
	case c.Absent != nil:
		fields = []string{c.Absent.Field}
	case c.All != nil:
		for _, x := range c.All {
			if err := m.checkCond(id, x); err != nil {
				return err
			}
		}
	case c.Any != nil:
		for _, x := range c.Any {
			if err := m.checkCond(id, x); err != nil {
				return err
			}
		}
	case c.Not != nil:
		return m.checkCond(id, *c.Not)
	}
	for _, f := range fields {
		if _, err := m.need(id, f); err != nil {
			return err
		}
	}
	return nil
}
