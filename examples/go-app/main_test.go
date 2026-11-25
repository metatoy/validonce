// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func post(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	newAPI(mux)
	req := httptest.NewRequest(http.MethodPost, "/contacts", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

type problem struct {
	Validonce []struct {
		RuleID string   `json:"ruleId"`
		Key    string   `json:"key"`
		Path   []string `json:"path"`
	} `json:"validonce"`
}

func issue(t *testing.T, body, ruleID, key, path string) {
	t.Helper()
	rec := post(t, body)
	if rec.Code != 422 {
		t.Fatalf("want 422, got %d: %s", rec.Code, rec.Body)
	}
	var p problem
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	for _, i := range p.Validonce {
		if i.RuleID == ruleID && i.Key == key && len(i.Path) == 1 && i.Path[0] == path {
			return
		}
	}
	t.Fatalf("no issue %s/%s/%s in %s", ruleID, key, path, rec.Body)
}

func TestContactValid(t *testing.T) {
	rec := post(t, `{"email":"a@example.test","country":"US","street":"1 Main","city":"X","postalCode":"55555","availableFrom":"2026-12-01","availableTo":"2026-12-02"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"ok":true`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
}

func TestContactEmailOrPhone(t *testing.T) {
	issue(t, `{"country":"CA"}`, "Contact.at_least_one_of.email", "rules.contact_email_or_phone", "email")
}

func TestContactAddressAllOrNone(t *testing.T) {
	issue(t, `{"email":"a@example.test","country":"CA","street":"1 Main"}`,
		"Contact.all_or_none.street", "rules.address_all_or_none", "street")
}

func TestContactPostalRequiredUS(t *testing.T) {
	issue(t, `{"email":"a@example.test","country":"US"}`,
		"Contact.required_when.postalCode", "rules.postal_code_required_us", "postalCode")
}

func TestContactDates(t *testing.T) {
	issue(t, `{"email":"a@example.test","country":"CA","availableFrom":"2026-12-05","availableTo":"2026-12-01"}`,
		"Contact.compare.availableTo", "rules.available_to_after_from", "availableTo")
}

func TestContactBodyCap(t *testing.T) {
	rec := post(t, `{"email":"a@example.test","country":"CA","city":"`+strings.Repeat("x", 20000)+`"}`)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("want 413, got %d", rec.Code)
	}
}

func TestCORSPlaygroundOrigin(t *testing.T) {
	mux := http.NewServeMux()
	newAPI(mux)
	req := httptest.NewRequest(http.MethodOptions, "/contacts", nil)
	req.Header.Set("Origin", "https://playground.metatoy.com")
	rec := httptest.NewRecorder()
	cors(mux).ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "https://playground.metatoy.com" {
		t.Fatal("origin not allowed")
	}
}
