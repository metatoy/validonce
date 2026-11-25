// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// k8s-cel-diff evaluates one x-kubernetes-validations rule per fixture case
// through the same pipeline the API server runs for a custom resource:
// prune unknown fields, drop non-nullable nulls, apply defaults, run the
// OpenAPI schema validation, then run the CEL rules. It prints one verdict
// per input. Throwaway-quality tool; never published.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	apiextensions "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	structuralschema "k8s.io/apiextensions-apiserver/pkg/apiserver/schema"
	celschema "k8s.io/apiextensions-apiserver/pkg/apiserver/schema/cel"
	"k8s.io/apiextensions-apiserver/pkg/apiserver/schema/defaulting"
	"k8s.io/apiextensions-apiserver/pkg/apiserver/schema/pruning"
	apiservervalidation "k8s.io/apiextensions-apiserver/pkg/apiserver/validation"
	k8sjson "k8s.io/apimachinery/pkg/util/json"
	"k8s.io/apimachinery/pkg/util/validation/field"
	celconfig "k8s.io/apiserver/pkg/apis/cel"
)

type Input struct {
	Data json.RawMessage `json:"data"`
	Note string          `json:"note"`
}

type Case struct {
	ID          string          `json:"id"`
	Description string          `json:"description,omitempty"`
	Schema      json.RawMessage `json:"schema"`
	Rule        int             `json:"rule"`
	Inputs      []Input         `json:"inputs"`
	// Validonce is the hand-written equivalent rule list; used by compare.mjs, ignored here.
	Validonce json.RawMessage `json:"validonce,omitempty"`
}

type Verdict struct {
	Case    string          `json:"case"`
	Index   int             `json:"input"`
	Note    string          `json:"note"`
	Data    json.RawMessage `json:"data"`
	Seen    json.RawMessage `json:"seenByCEL,omitempty"` // object after prune/null-drop/default
	Verdict string          `json:"verdict"`             // pass | fail | error | rejected
	Stage   string          `json:"stage"`               // openapi | cel | compile
	Message string          `json:"message,omitempty"`
	// CELAlso: when OpenAPI validation fails with a non-blocking error (for example
	// minLength), the real API server still runs CEL and reports both. This is that verdict.
	CELAlso string `json:"celAlso,omitempty"`
}

func fatal(err error) { fmt.Fprintln(os.Stderr, "error:", err); os.Exit(1) }

func structuralFor(raw json.RawMessage, keep int) (*apiextensions.JSONSchemaProps, *structuralschema.Structural, error) {
	var v1 apiextensionsv1.JSONSchemaProps
	if err := json.Unmarshal(raw, &v1); err != nil {
		return nil, nil, err
	}
	// Keep only the rule under test, so one verdict is one rule.
	if keep >= 0 && keep < len(v1.XValidations) {
		v1.XValidations = apiextensionsv1.ValidationRules{v1.XValidations[keep]}
	}
	var in apiextensions.JSONSchemaProps
	if err := apiextensionsv1.Convert_v1_JSONSchemaProps_To_apiextensions_JSONSchemaProps(&v1, &in, nil); err != nil {
		return nil, nil, err
	}
	s, err := structuralschema.NewStructural(&in)
	if err != nil {
		return nil, nil, err
	}
	if errs := structuralschema.ValidateStructural(field.NewPath("schema"), s); len(errs) > 0 {
		return nil, nil, fmt.Errorf("not structural: %v", errs.ToAggregate())
	}
	return &in, s, nil
}

// blocking mirrors hasBlockingErr in apiextensions-apiserver pkg/registry/customresource/strategy.go:
// CEL is skipped when the schema errors are of these types.
func blocking(errs field.ErrorList) bool {
	for _, e := range errs {
		switch e.Type {
		case field.ErrorTypeNotSupported, field.ErrorTypeRequired, field.ErrorTypeTooLong, field.ErrorTypeTooMany, field.ErrorTypeTypeInvalid:
			return true
		}
	}
	return false
}

func classify(errs field.ErrorList) string {
	if len(errs) == 0 {
		return "pass"
	}
	msg := errs.ToAggregate().Error()
	if strings.Contains(msg, "evaluating rule:") || strings.Contains(msg, "compile error") || strings.Contains(msg, "did not match a supported") {
		return "error"
	}
	return "fail"
}

func run(c Case) []Verdict {
	in, s, err := structuralFor(c.Schema, c.Rule)
	if err != nil {
		fatal(fmt.Errorf("%s: %w", c.ID, err))
	}
	ov, _, err := apiservervalidation.NewSchemaValidator(in)
	if err != nil {
		fatal(fmt.Errorf("%s: %w", c.ID, err))
	}
	cv := celschema.NewValidator(s, true, celconfig.PerCallLimit)
	var out []Verdict
	for i, inp := range c.Inputs {
		v := Verdict{Case: c.ID, Index: i, Note: inp.Note, Data: inp.Data}
		var obj interface{}
		if err := k8sjson.Unmarshal(inp.Data, &obj); err != nil {
			fatal(fmt.Errorf("%s[%d]: %w", c.ID, i, err))
		}
		// API server order: prune unknown fields, drop non-nullable nulls, default.
		pruning.Prune(obj, s, false)
		defaulting.PruneNonNullableNullsWithoutDefaults(obj, s)
		defaulting.Default(obj, s)
		seen, _ := json.Marshal(obj)
		v.Seen = seen
		oerrs := apiservervalidation.ValidateCustomResource(nil, obj, ov)
		if len(oerrs) > 0 {
			v.Verdict, v.Stage, v.Message = "rejected", "openapi", oerrs.ToAggregate().Error()
			if !blocking(oerrs) {
				cerrs, _ := cv.Validate(context.Background(), nil, s, obj, nil, celconfig.RuntimeCELCostBudget)
				v.CELAlso = classify(cerrs)
			} else {
				v.CELAlso = "skipped"
			}
			out = append(out, v)
			continue
		}
		errs, _ := cv.Validate(context.Background(), nil, s, obj, nil, celconfig.RuntimeCELCostBudget)
		v.Stage = "cel"
		switch {
		case len(errs) == 0:
			v.Verdict = "pass"
		default:
			msg := errs.ToAggregate().Error()
			v.Message = msg
			v.Verdict = "fail"
			if strings.Contains(msg, "evaluating rule:") || strings.Contains(msg, "compile error") || strings.Contains(msg, "did not match a supported") {
				v.Verdict = "error"
			}
			if strings.Contains(msg, "compile error") {
				v.Stage = "compile"
			}
		}
		out = append(out, v)
	}
	return out
}

func main() {
	dir := flag.String("fixtures", "../../conformance/kubernetes", "fixtures directory")
	asJSON := flag.Bool("json", false, "print verdicts as JSON")
	only := flag.String("case", "", "only run cases whose id has this prefix")
	flag.Parse()
	files, _ := filepath.Glob(filepath.Join(*dir, "*.json"))
	sort.Strings(files)
	var all []Verdict
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			fatal(err)
		}
		var cases []Case
		if err := json.Unmarshal(b, &cases); err != nil {
			fatal(fmt.Errorf("%s: %w", f, err))
		}
		for _, c := range cases {
			if *only != "" && !strings.HasPrefix(c.ID, *only) {
				continue
			}
			all = append(all, run(c)...)
		}
	}
	if *asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", " ")
		_ = enc.Encode(all)
		return
	}
	for _, v := range all {
		fmt.Printf("%-28s #%d %-9s %s  %s\n", v.Case, v.Index, v.Verdict, v.Data, v.Note)
		if v.Message != "" {
			fmt.Printf("    [%s] %s\n", v.Stage, v.Message)
		}
	}
}
