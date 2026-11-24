// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package validonce_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	validonce "github.com/metatoy/validonce/go"
)

type Signup struct {
	Plan     string  `json:"plan"`
	Company  *string `json:"company,omitempty"`
	Email    string  `json:"email"`
	Start    string  `json:"start" format:"date"`
	End      *string `json:"end,omitempty" format:"date"`
	Quantity int     `json:"quantity"`
	Hidden   string  `json:"-"`
}

func signupRules(t *testing.T) *validonce.Rules {
	t.Helper()
	rs, err := validonce.Build[Signup](
		validonce.When(validonce.Eq("plan", "pro")).Require("company", validonce.Key("rules.company_required")),
		validonce.Cmp("end").Ge(validonce.Ref("start"), validonce.Key("rules.end_after_start")),
		validonce.Cmp("quantity").Ge(validonce.Val(1), validonce.Key("rules.quantity_min"),
			validonce.Params(map[string]any{"min": 1})),
	)
	if err != nil {
		t.Fatal(err)
	}
	return rs
}

func TestBuildDefaultIDsAndJSON(t *testing.T) {
	rs := signupRules(t)
	var ids []string
	for _, r := range rs.Set().Rules {
		ids = append(ids, r.ID)
	}
	want := "Signup.required_when.company,Signup.compare.end,Signup.compare.quantity"
	if strings.Join(ids, ",") != want {
		t.Fatalf("ids = %v, want %s", ids, want)
	}
	b, _ := json.Marshal(rs.Set())
	back, err := validonce.ParseRuleSet(b)
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := json.Marshal(back); string(got) != string(b) {
		t.Fatalf("round trip differs:\n%s\n%s", got, b)
	}
	if !strings.Contains(string(b), `"type":"date"`) || !strings.Contains(string(b), `"type":"number"`) {
		t.Fatalf("compare types not inferred: %s", b)
	}
}

func TestCheck(t *testing.T) {
	rs := signupRules(t)
	end := "2026-01-01"
	issues, err := rs.Check(Signup{Plan: "pro", Email: "a@example.test", Start: "2026-02-01", End: &end, Quantity: 0})
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) != 3 || issues[0].Path[0] != "company" || issues[1].Path[0] != "end" || issues[2].Params["min"] != float64(1) {
		t.Fatalf("issues = %+v", issues)
	}
	p := rs.Problem(Signup{Plan: "free", Email: "x", Start: "2026-01-01", Quantity: 2})
	if p != nil {
		t.Fatalf("unexpected problem %v", p)
	}
}

func TestBuildErrors(t *testing.T) {
	type T struct {
		A    string `json:"a"`
		B    bool   `json:"b"`
		When time.Time
		N    int `json:"n"`
	}
	cases := map[string][]validonce.Builder{
		"unknown field":    {validonce.When(validonce.Eq("zzz", "x")).Require("a", validonce.Key("k"))},
		"unknown path":     {validonce.AtLeastOneOf([]string{"a", "nope"}, validonce.Key("k"))},
		"unsupported type": {validonce.Cmp("b").Eq(validonce.Val(true), validonce.Key("k"))},
		"mismatch":         {validonce.Cmp("n").Ge(validonce.Ref("a"), validonce.Key("k"))},
		"constant":         {validonce.Cmp("n").Ge(validonce.Val("x"), validonce.Key("k"))},
		"no key":           {validonce.AllOrNone([]string{"a", "n"})},
		"collision": {
			validonce.AtLeastOneOf([]string{"a", "n"}, validonce.Key("k")),
			validonce.AtLeastOneOf([]string{"a", "When"}, validonce.Key("k")),
		},
		"one field": {validonce.AtLeastOneOf([]string{"a"}, validonce.Key("k"))},
	}
	for name, bs := range cases {
		if _, err := validonce.Build[T](bs...); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	// Valid: the untagged time.Time field is named by its Go name, and compares as a datetime.
	if _, err := validonce.Build[T](validonce.Cmp("When").Lt(validonce.Val("2030-01-01T00:00:00Z"), validonce.Key("k"))); err != nil {
		t.Errorf("time.Time compare: %v", err)
	}
	// Different ids avoid the collision.
	if _, err := validonce.Build[T](
		validonce.AtLeastOneOf([]string{"a", "n"}, validonce.Key("k")),
		validonce.AtLeastOneOf([]string{"a", "When"}, validonce.Key("k"), validonce.ID("T.other")),
	); err != nil {
		t.Errorf("explicit id: %v", err)
	}
}

func TestParseRejectsUnknown(t *testing.T) {
	for _, in := range []string{
		`{"version":2,"rules":[]}`,
		`{"version":1,"rules":[{"id":"x","kind":"nope","message":{"key":"k"}}]}`,
	} {
		if _, err := validonce.ParseRuleSet([]byte(in)); err == nil {
			t.Errorf("accepted %s", in)
		}
	}
}
