// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// validonce-migrate runner for go-playground/validator. Copy this directory to a scratch
// directory, replace model.go with the user's struct and struct-level validators, then:
//
//	go mod tidy && go run . <inputs.jsonl> <out.jsonl>
//
// Input: one wire-JSON object per line. Output, one line per input:
//
//	{"accept": bool, "paths": ["top-level wire field names with errors"], "error": "only if the validator itself failed"}
//
// Field names come from the json tag (RegisterTagNameFunc), so paths are wire names. A line
// that does not decode into the struct is reported with "error" ("parse: ...") and is never
// counted as a rejection. The runner opens no network connections and reads only the inputs.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"runtime"
	"strings"

	"github.com/go-playground/validator/v10"
)

type result struct {
	Accept bool     `json:"accept"`
	Paths  []string `json:"paths"`
	Error  string   `json:"error,omitempty"`
}

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: go run . <inputs.jsonl> <out.jsonl>")
		os.Exit(2)
	}
	in, err := os.Open(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, "validonce runner: cannot open inputs:", err)
		os.Exit(3)
	}
	defer in.Close()
	out, err := os.Create(os.Args[2])
	if err != nil {
		fmt.Fprintln(os.Stderr, "validonce runner: cannot create output:", err)
		os.Exit(3)
	}
	defer out.Close()

	v := validator.New(validator.WithRequiredStructEnabled())
	v.RegisterTagNameFunc(func(f reflect.StructField) string {
		name := strings.SplitN(f.Tag.Get("json"), ",", 2)[0]
		if name == "-" {
			return ""
		}
		return name
	})
	register(v)
	fmt.Fprintf(os.Stderr, "validonce-runner: run-go go=%s validator=go-playground/validator/v10 (no network, reads only the inputs file)\n", runtime.Version())

	sc := bufio.NewScanner(in)
	sc.Buffer(make([]byte, 1<<20), 1<<26)
	w := bufio.NewWriter(out)
	defer w.Flush()
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		b, _ := json.Marshal(run(v, []byte(line)))
		w.Write(b)
		w.WriteByte('\n')
	}
}

func run(v *validator.Validate, raw []byte) (res result) {
	res.Paths = []string{}
	defer func() {
		if r := recover(); r != nil {
			res = result{Paths: []string{}, Error: fmt.Sprint("panic: ", r)}
		}
	}()
	m := newModel()
	if err := json.Unmarshal(raw, m); err != nil {
		return result{Paths: []string{}, Error: "parse: " + err.Error()}
	}
	err := v.Struct(m)
	if err == nil {
		res.Accept = true
		return
	}
	verrs, ok := err.(validator.ValidationErrors)
	if !ok {
		return result{Paths: []string{}, Error: err.Error()}
	}
	seen := map[string]bool{}
	for _, fe := range verrs {
		p := fe.Field() // the wire name, from the json tag or the name given to ReportError
		if p == "" {
			p = "__root__"
		}
		if !seen[p] {
			seen[p] = true
			res.Paths = append(res.Paths, p)
		}
	}
	return
}
