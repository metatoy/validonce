// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package validonce_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	validonce "github.com/metatoy/validonce/go"
)

type caseFile struct {
	Suite string `json:"suite"`
	Cases []struct {
		ID          string            `json:"id"`
		Description string            `json:"description"`
		Rules       []validonce.Rule  `json:"rules"`
		Data        map[string]any    `json:"data"`
		Expect      []validonce.Issue `json:"expect"`
	} `json:"cases"`
}

// TestConformance runs every shared case on both sides and asserts the case count equals the
// number of cases in the files, so a skipped or unreadable file cannot pass silently.
func TestConformance(t *testing.T) {
	files, err := filepath.Glob("../conformance/rules/*.json")
	if err != nil || len(files) == 0 {
		t.Fatalf("no conformance files found: %v", err)
	}
	want, ran := 0, 0
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		// Count independently of the typed decode.
		var generic struct {
			Cases []json.RawMessage `json:"cases"`
		}
		if err := json.Unmarshal(raw, &generic); err != nil {
			t.Fatal(err)
		}
		want += len(generic.Cases)
		var cf caseFile
		if err := json.Unmarshal(raw, &cf); err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		for _, c := range cf.Cases {
			if err := validonce.ValidateRules(c.Rules); err != nil {
				t.Errorf("%s: invalid rules: %v", c.ID, err)
				continue
			}
			clientExpect := []validonce.Issue{}
			serverOnly := map[string]bool{}
			for _, r := range c.Rules {
				if r.ServerOnly {
					serverOnly[r.ID] = true
				}
			}
			for _, i := range c.Expect {
				if !serverOnly[i.RuleID] {
					clientExpect = append(clientExpect, i)
				}
			}
			serverExpect := c.Expect
			if serverExpect == nil {
				serverExpect = []validonce.Issue{}
			}
			for side, exp := range map[validonce.Side][]validonce.Issue{
				validonce.Server: serverExpect,
				validonce.Client: clientExpect,
			} {
				name := c.ID + "/server"
				if side == validonce.Client {
					name = c.ID + "/client"
				}
				got := validonce.Evaluate(c.Rules, c.Data, side)
				if !reflect.DeepEqual(norm(got), norm(exp)) {
					t.Errorf("%s (%s): got %s, want %s", name, c.Description, js(got), js(exp))
				}
				ran++
			}
		}
	}
	if want == 0 {
		t.Fatal("zero conformance cases")
	}
	if ran != want*2 {
		t.Errorf("ran %d evaluations, want %d (cases x 2 sides)", ran, want*2)
	}
	t.Logf("%d cases x 2 sides = %d evaluations", want, ran)
}

// norm round-trips through JSON so numbers and nil/empty maps compare the way the wire does.
func norm(v any) any {
	b, _ := json.Marshal(v)
	var out any
	_ = json.Unmarshal(b, &out)
	return out
}

func js(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
