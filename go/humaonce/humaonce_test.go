// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package humaonce_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humatest"

	validonce "github.com/metatoy/validonce/go"
	"github.com/metatoy/validonce/go/humaonce"
)

type Signup struct {
	Plan    string  `json:"plan" enum:"free,pro"`
	Company *string `json:"company,omitempty" nullable:"true"`
	Start   string  `json:"start" format:"date"`
	End     *string `json:"end,omitempty" format:"date" nullable:"true"`
}

var rules = validonce.MustBuild[Signup](
	validonce.When(validonce.Eq("plan", "pro")).Require("company", validonce.Key("rules.company_required")),
	validonce.Cmp("end").Ge(validonce.Ref("start"), validonce.Key("rules.end_after_start")),
)

func (Signup) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return humaonce.Transform(rules, s)
}

type in struct{ Body Signup }
type out struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func TestHuma(t *testing.T) {
	_, api := humatest.New(t)
	huma.Post(api, "/signups", humaonce.Wrap(rules, func(context.Context, *in) (*out, error) {
		o := &out{}
		o.Body.OK = true
		return o, nil
	}))

	resp := api.Post("/signups", map[string]any{"plan": "pro", "start": "2026-02-01", "end": "2026-01-01"})
	if resp.Code != 422 {
		t.Fatalf("status %d: %s", resp.Code, resp.Body.String())
	}
	if ct := resp.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/problem+json") {
		t.Fatalf("content type %q", ct)
	}
	var body struct {
		Status    int
		Validonce []validonce.Issue
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Status != 422 || len(body.Validonce) != 2 || body.Validonce[0].RuleID != "Signup.required_when.company" {
		t.Fatalf("body = %s", resp.Body.String())
	}

	if resp := api.Post("/signups", map[string]any{"plan": "free", "start": "2026-01-01", "end": "2026-02-01"}); resp.Code != 200 {
		t.Fatalf("valid body: %d %s", resp.Code, resp.Body.String())
	}

	// The type's TransformSchema put the rules on the component schema.
	s := api.OpenAPI().Components.Schemas.Map()["Signup"]
	if s == nil || s.Extensions["x-validonce"] == nil {
		t.Fatalf("no x-validonce on Signup: %+v", s)
	}
	doc, _ := json.Marshal(api.OpenAPI())
	if !strings.Contains(string(doc), `"x-validonce"`) || !strings.Contains(string(doc), "Signup.compare.end") {
		t.Fatalf("OpenAPI document lacks the rules: %s", doc)
	}
}

func TestAnnotate(t *testing.T) {
	_, api := humatest.New(t)
	if err := humaonce.Annotate(api, rules); err == nil {
		t.Fatal("expected an error before the schema is registered")
	}
	huma.Post(api, "/signups", func(context.Context, *in) (*out, error) { return &out{}, nil })
	if err := humaonce.Annotate(api, rules); err != nil {
		t.Fatal(err)
	}
}
