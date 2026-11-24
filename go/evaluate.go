// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package validonce

import (
	"encoding/json"
	"math"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Side selects which rules run: the server runs every rule, a client skips server_only rules.
type Side int

// The two sides.
const (
	Server Side = iota
	Client
)

// Evaluate runs rules against data, the wire form of the object (a decoded JSON object), and
// returns one issue per failing rule, in rule order. The result is never nil. Rules should have
// passed ValidateRules; a rule of an unknown kind is ignored here.
func Evaluate(rules []Rule, data map[string]any, side Side) []Issue {
	issues := []Issue{}
	for i := range rules {
		r := &rules[i]
		if side == Client && r.ServerOnly {
			continue
		}
		failed := false
		path := ""
		switch r.Kind {
		case KindRequiredWhen:
			failed = r.When != nil && evalCondition(*r.When, data) && isBlank(get(data, r.Field))
			path = r.Field
		case KindCompare:
			failed = compareFails(r, data)
			if r.Left != nil {
				path = r.Left.Field
			}
		case KindAtLeastOneOf, KindExactlyOneOf, KindAllOrNone:
			given := 0
			for _, f := range r.Fields {
				if !isBlank(get(data, f)) {
					given++
				}
			}
			switch r.Kind {
			case KindAtLeastOneOf:
				failed = given == 0
			case KindExactlyOneOf:
				failed = given != 1
			default:
				failed = given > 0 && given < len(r.Fields)
			}
			if len(r.Fields) > 0 {
				path = r.Fields[0]
			}
		}
		if !failed {
			continue
		}
		if r.Path != "" {
			path = r.Path
		}
		params := make(map[string]any, len(r.Message.Params))
		for k, v := range r.Message.Params {
			params[k] = v
		}
		issues = append(issues, Issue{Path: []string{path}, RuleID: r.ID, Key: r.Message.Key, Params: params})
	}
	return issues
}

func get(data map[string]any, field string) any {
	return data[field] // a missing key yields nil, which is blank
}

// isBlank: missing, null, "" or []. Nothing else.
func isBlank(v any) bool {
	switch x := v.(type) {
	case nil:
		return true
	case string:
		return x == ""
	}
	rv := reflect.ValueOf(v)
	return rv.Kind() == reflect.Slice && rv.Len() == 0
}

// scalar normalises a JSON scalar: strings, booleans and every numeric type (to float64).
func scalar(v any) (any, bool) {
	switch x := v.(type) {
	case string, bool:
		return x, true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int8:
		return float64(x), true
	case int16:
		return float64(x), true
	case int32:
		return float64(x), true
	case int64:
		return float64(x), true
	case uint:
		return float64(x), true
	case uint8:
		return float64(x), true
	case uint16:
		return float64(x), true
	case uint32:
		return float64(x), true
	case uint64:
		return float64(x), true
	}
	return nil, false
}

// strictEq: same JSON type and same value; no coercion, a bool is never a number.
func strictEq(a, b any) bool {
	x, ok := scalar(a)
	if !ok {
		return false
	}
	y, ok := scalar(b)
	if !ok {
		return false
	}
	switch xv := x.(type) {
	case string:
		yv, ok := y.(string)
		return ok && xv == yv
	case bool:
		yv, ok := y.(bool)
		return ok && xv == yv
	case float64:
		yv, ok := y.(float64)
		return ok && xv == yv
	}
	return false
}

func evalCondition(c Condition, data map[string]any) bool {
	switch {
	case c.Eq != nil:
		return strictEq(get(data, c.Eq.Field), c.Eq.Value)
	case c.Ne != nil:
		return !strictEq(get(data, c.Ne.Field), c.Ne.Value)
	case c.In != nil:
		v := get(data, c.In.Field)
		for _, x := range c.In.Values {
			if strictEq(v, x) {
				return true
			}
		}
		return false
	case c.Present != nil:
		return !isBlank(get(data, c.Present.Field))
	case c.Absent != nil:
		return isBlank(get(data, c.Absent.Field))
	case c.All != nil:
		for _, x := range c.All {
			if !evalCondition(x, data) {
				return false
			}
		}
		return true
	case c.Any != nil:
		for _, x := range c.Any {
			if evalCondition(x, data) {
				return true
			}
		}
		return false
	case c.Not != nil:
		return !evalCondition(*c.Not, data)
	}
	return false
}

var (
	dateRE     = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})$`)
	datetimeRE = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$`)
)

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

func validDate(y, m, d int) bool {
	if y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 {
		return false
	}
	days := 31
	switch m {
	case 4, 6, 9, 11:
		days = 30
	case 2:
		days = 28
		if (y%4 == 0 && y%100 != 0) || y%400 == 0 {
			days = 29
		}
	}
	return d <= days
}

func parseDate(v any) (float64, bool) {
	s, ok := v.(string)
	if !ok {
		return 0, false
	}
	m := dateRE.FindStringSubmatch(s)
	if m == nil {
		return 0, false
	}
	y, mo, d := atoi(m[1]), atoi(m[2]), atoi(m[3])
	if !validDate(y, mo, d) {
		return 0, false
	}
	return float64(y*10000 + mo*100 + d), true
}

// parseDateTime returns the instant in epoch milliseconds.
func parseDateTime(v any) (float64, bool) {
	s, ok := v.(string)
	if !ok {
		return 0, false
	}
	m := datetimeRE.FindStringSubmatch(s)
	if m == nil {
		return 0, false
	}
	y, mo, d := atoi(m[1]), atoi(m[2]), atoi(m[3])
	h, mi, sec := atoi(m[4]), atoi(m[5]), atoi(m[6])
	if !validDate(y, mo, d) || h > 23 || mi > 59 || sec > 59 {
		return 0, false
	}
	ms := atoi((m[7] + "000")[:3])
	var offset int64
	if z := m[8]; z != "Z" {
		oh, om := atoi(z[1:3]), atoi(z[4:6])
		if oh > 23 || om > 59 {
			return 0, false
		}
		offset = int64(oh*60+om) * 60000
		if z[0] == '-' {
			offset = -offset
		}
	}
	t := time.Date(y, time.Month(mo), d, h, mi, sec, ms*1_000_000, time.UTC)
	return float64(t.UnixMilli() - offset), true
}

type operand struct {
	f     float64
	s     string
	isStr bool
}

func typed(typ string, v any) (operand, bool) {
	switch typ {
	case "number":
		x, ok := scalar(v)
		if _, isStr := x.(string); !ok || isStr {
			return operand{}, false
		}
		f, isNum := x.(float64)
		return operand{f: f}, isNum && !math.IsNaN(f) && !math.IsInf(f, 0)
	case "string":
		s, ok := v.(string)
		return operand{s: s, isStr: true}, ok
	case "date":
		f, ok := parseDate(v)
		return operand{f: f}, ok
	case "datetime":
		f, ok := parseDateTime(v)
		return operand{f: f}, ok
	}
	return operand{}, false
}

func compareFails(r *Rule, data map[string]any) bool {
	if r.Left == nil || r.Right == nil {
		return false
	}
	l := get(data, r.Left.Field)
	var rv any
	if r.Right.HasValue {
		rv = r.Right.Value
	} else {
		rv = get(data, r.Right.Field)
	}
	if isBlank(l) || isBlank(rv) {
		return false
	}
	a, ok := typed(r.Type, l)
	if !ok {
		return false
	}
	b, ok := typed(r.Type, rv)
	if !ok {
		return false
	}
	var c int
	if a.isStr {
		// Go compares strings bytewise; UTF-8 byte order equals code point order.
		c = strings.Compare(a.s, b.s)
	} else {
		switch {
		case a.f < b.f:
			c = -1
		case a.f > b.f:
			c = 1
		}
	}
	switch r.Op {
	case "lt":
		return !(c < 0)
	case "le":
		return !(c <= 0)
	case "gt":
		return !(c > 0)
	case "ge":
		return !(c >= 0)
	case "eq":
		return c != 0
	case "ne":
		return c == 0
	}
	return false
}
