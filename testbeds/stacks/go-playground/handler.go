// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

package signup

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"
)

// Handler serves POST /signups: 200 when the body is valid, 422 with the failing fields, 400 for
// a body that is not a Signup.
func Handler() http.Handler {
	v := NewValidator()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body Signup
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid JSON body"})
			return
		}
		if err := v.Struct(body); err != nil {
			var verrs validator.ValidationErrors
			if !errors.As(err, &verrs) {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "validation failed"})
				return
			}
			fields := []string{}
			for _, e := range verrs {
				fields = append(fields, e.Field())
			}
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"fields": fields})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
