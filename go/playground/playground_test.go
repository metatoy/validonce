// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package playground_test

import (
	"encoding/json"
	"testing"

	"github.com/go-playground/validator/v10"

	validonce "github.com/metatoy/validonce/go"
	"github.com/metatoy/validonce/go/playground"
)

type Signup struct {
	Plan     string  `json:"plan" validate:"oneof=free pro"`
	Company  *string `json:"company,omitempty"`
	Email    string  `json:"email" validate:"min=1"`
	Start    string  `json:"start" format:"date"`
	End      *string `json:"end,omitempty" format:"date"`
	Quantity int     `json:"quantity"`
}

var rules = validonce.MustBuild[Signup](
	validonce.When(validonce.Eq("plan", "pro")).Require("company", validonce.Key("rules.company_required")),
	validonce.Cmp("end").Ge(validonce.Ref("start"), validonce.Key("rules.end_after_start")),
	validonce.Cmp("quantity").Ge(validonce.Val(1), validonce.Key("rules.quantity_min"), validonce.Params(map[string]any{"min": 1})),
)

func TestRulesRunInsideValidator(t *testing.T) {
	v := validator.New()
	playground.Register(v, rules, Signup{})

	end := "2026-01-01"
	err := v.Struct(Signup{Plan: "pro", Email: "a@example.test", Start: "2026-02-01", End: &end, Quantity: 0})
	if err == nil {
		t.Fatal("expected errors")
	}
	issues, ok := playground.IssuesFromError(rules, err)
	if !ok || len(issues) != 3 {
		t.Fatalf("issues = %+v", issues)
	}
	b, _ := json.Marshal(issues[0])
	if string(b) != `{"path":["company"],"ruleId":"Signup.required_when.company","key":"rules.company_required","params":{}}` {
		t.Fatalf("issue 0 = %s", b)
	}
	if issues[1].Path[0] != "end" || issues[2].Params["min"] != float64(1) {
		t.Fatalf("issues = %+v", issues)
	}
	if p, ok := playground.FromError(rules, err).(*validonce.Problem); !ok || p.Status != 422 {
		t.Fatalf("FromError = %v", playground.FromError(rules, err))
	}

	// The application's own tags still run alongside; a valid value passes.
	good := Signup{Plan: "free", Email: "a@example.test", Start: "2026-02-01", Quantity: 1}
	if err := v.Struct(good); err != nil {
		t.Fatal(err)
	}
	if err := v.Struct(Signup{Plan: "weird", Email: "", Start: "2026-02-01", Quantity: 1}); err == nil {
		t.Fatal("field tags should fail")
	} else if _, ok := playground.IssuesFromError(rules, err); ok {
		t.Fatal("no rule failures expected")
	}
}

type Order struct {
	Items  []Signup          `json:"items" validate:"dive"`
	Main   Signup            `json:"main"`
	ByName map[string]Signup `json:"byName" validate:"dive"`
}

func TestNestedPaths(t *testing.T) {
	v := validator.New()
	playground.Register(v, rules, Signup{})
	ok := Signup{Plan: "free", Email: "a@example.test", Start: "2026-02-01", Quantity: 1}
	bad := Signup{Plan: "pro", Email: "a@example.test", Start: "2026-02-01", Quantity: 1}
	err := v.Struct(Order{Items: []Signup{ok, bad}, Main: bad, ByName: map[string]Signup{"a.b": bad}})
	issues, found := playground.IssuesFromError(rules, err)
	if !found {
		t.Fatalf("no issues: %v", err)
	}
	var got []string
	for _, i := range issues {
		b, _ := json.Marshal(i.Path)
		got = append(got, string(b))
	}
	want := map[string]bool{`["items","1","company"]`: true, `["main","company"]`: true, `["byName","a.b","company"]`: true}
	if len(got) != 3 {
		t.Fatalf("paths = %v", got)
	}
	for _, g := range got {
		if !want[g] {
			t.Errorf("unexpected path %s (all: %v)", g, got)
		}
	}
}
