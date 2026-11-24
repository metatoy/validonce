// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package validonce

import "strings"

// DefaultProblemStatus is the status a failing rule set is reported with.
const DefaultProblemStatus = 422

// Problem is the RFC 9457 problem details body validonce servers return when rules fail: the
// issue list sits in a top-level member named "validonce" (see "Transport" in rule-format-v1).
// It is also an error, so a handler can return it directly.
type Problem struct {
	Type      string  `json:"type"`
	Title     string  `json:"title"`
	Status    int     `json:"status"`
	Detail    string  `json:"detail,omitempty"`
	Validonce []Issue `json:"validonce"`
}

// NewProblem builds the problem for issues with the given status (0 means 422).
func NewProblem(issues []Issue, status int) *Problem {
	if status == 0 {
		status = DefaultProblemStatus
	}
	if issues == nil {
		issues = []Issue{}
	}
	return &Problem{
		Type:      "about:blank",
		Title:     "One or more validation errors occurred.",
		Status:    status,
		Validonce: issues,
	}
}

// Error implements error.
func (p *Problem) Error() string {
	keys := make([]string, len(p.Validonce))
	for i, x := range p.Validonce {
		keys[i] = x.Key
	}
	return p.Title + " (" + strings.Join(keys, ", ") + ")"
}

// GetStatus returns the HTTP status (the method web frameworks look for).
func (p *Problem) GetStatus() int { return p.Status }

// ContentType maps a JSON content type to application/problem+json, as problem details require.
func (p *Problem) ContentType(ct string) string {
	if ct == "application/json" {
		return "application/problem+json"
	}
	if ct == "application/cbor" {
		return "application/problem+cbor"
	}
	return ct
}

// Problem evaluates r on v (server side) and returns a *Problem when any rule fails, else nil.
// A value that cannot be encoded is returned as an ordinary error.
func (r *Rules) Problem(v any) error {
	issues, err := r.Check(v)
	if err != nil {
		return err
	}
	if len(issues) == 0 {
		return nil
	}
	return NewProblem(issues, 0)
}
