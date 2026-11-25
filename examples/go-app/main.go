// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Command go-app is the Go (Huma) implementation of the shared POST /signups contract.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"

	"github.com/metatoy/validonce/go/humaonce"
)

var allowedOrigins = map[string]bool{
	"http://localhost:5173":          true,
	"http://127.0.0.1:5173":          true,
	"http://localhost:4200":          true,
	"http://127.0.0.1:4200":          true,
	"https://playground.metatoy.com": true,
	"http://localhost:5180":          true,
}

type signupInput struct {
	Body Signup
}

type contactInput struct {
	Body Contact
}

type signupOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func newAPI(mux *http.ServeMux) huma.API {
	cfg := huma.DefaultConfig("GoApp", "1.0.0")
	cfg.CreateHooks = nil // no $schema links: the document stays small and deterministic
	api := humago.New(mux, cfg)

	huma.Register(api, huma.Operation{
		OperationID: "createSignup",
		Method:      http.MethodPost,
		Path:        "/signups",
	}, humaonce.Wrap(signupRules, func(_ context.Context, _ *signupInput) (*signupOutput, error) {
		out := &signupOutput{}
		out.Body.OK = true
		return out, nil
	}))

	// Stateless; bodies are never logged. Huma answers 413 past the cap.
	huma.Register(api, huma.Operation{
		OperationID:  "createContact",
		Method:       http.MethodPost,
		Path:         "/contacts",
		MaxBodyBytes: 16 * 1024,
	}, humaonce.Wrap(contactRules, func(_ context.Context, _ *contactInput) (*signupOutput, error) {
		out := &signupOutput{}
		out.Body.OK = true
		return out, nil
	}))

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	return api
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); allowedOrigins[origin] {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Vary", "Origin")
			h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			if reqHeaders := r.Header.Get("Access-Control-Request-Headers"); reqHeaders != "" {
				h.Set("Access-Control-Allow-Headers", reqHeaders)
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func exportOpenAPI(path string) error {
	api := newAPI(http.NewServeMux())
	b, err := json.MarshalIndent(api.OpenAPI(), "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

func main() {
	if len(os.Args) == 3 && os.Args[1] == "--export-openapi" {
		if err := exportOpenAPI(os.Args[2]); err != nil {
			log.Fatal(err)
		}
		return
	}
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = "localhost:8040"
	}
	mux := http.NewServeMux()
	newAPI(mux)
	fmt.Println("listening on", addr)
	log.Fatal(http.ListenAndServe(addr, cors(mux)))
}
