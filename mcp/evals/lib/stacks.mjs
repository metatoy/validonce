// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Offline toolchains and whole-project runners for the Go, Java and wrapped-JavaScript fixtures. The skill's runners
// (skills/validonce-migrate/scripts) run an isolated validator; the grader needs to run the project's own entry point,
// before and after the migration, and (Go, Java) to export the migrated rules.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { evalsDir, repoRoot, scratchRoot, skillsDir, testbeds } from "./util.mjs";

const VALIDONCE_GO = "v0.5.0";
// Keyed on what the cache holds, so a dependency bump in the runner or in go/ rebuilds it.
const GO_ROOT = `_go-${createHash("sha256").update(["skills/validonce-migrate/scripts/run-go/go.mod", "go/go.mod"].map((f) => readFileSync(join(repoRoot, f))).join("\n")).digest("hex").slice(0, 8)}`;
const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 300_000, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed (exit ${r.status}): ${`${r.stderr ?? ""}${r.stdout ?? ""}${r.error ?? ""}`.slice(-500)}`);
  return r;
};
/** Copy-on-write directory copy where the file system has it. */
const clone = (from, to) => { mkdirSync(join(to, ".."), { recursive: true }); spawnSync("cp", ["-Rc", from, to]).status === 0 || cpSync(from, to, { recursive: true }); };

export const goEnv = (dir) => ({
  GOMODCACHE: join(dir, "mod"), GOCACHE: join(dir, "build"), GOPATH: join(dir, "path"), // offline: the local validonce module, then the module cache itself, served as a file proxy
  GOPROXY: `file://${join(scratchRoot(), GO_ROOT, "proxy")},file://${join(dir, "mod/cache/download")}`, GOSUMDB: "off", GONOSUMCHECK: "1",
  GOFLAGS: "-mod=mod -modcacherw", GOTOOLCHAIN: "local", GOTELEMETRY: "off",
});

/** Module cache with go-playground/validator, the workspace validonce module (as v0.5.0) and the skill runner's dependencies. */
export function ensureGo() {
  const root = join(scratchRoot(), GO_ROOT);
  if (existsSync(join(root, "ready"))) return root;
  rmSync(root, { recursive: true, force: true });
  const mod = "github.com/metatoy/validonce/go", at = `${mod}@${VALIDONCE_GO}`;
  const stage = join(root, "stage", at), v = join(root, "proxy", mod, "@v");
  mkdirSync(v, { recursive: true });
  cpSync(join(repoRoot, "go"), stage, { recursive: true, filter: (s) => !/_test\.go$/.test(s) });
  sh("zip", ["-qr", join(v, `${VALIDONCE_GO}.zip`), at], { cwd: join(root, "stage") });
  cpSync(join(repoRoot, "go/go.mod"), join(v, `${VALIDONCE_GO}.mod`));
  writeFileSync(join(v, `${VALIDONCE_GO}.info`), JSON.stringify({ Version: VALIDONCE_GO, Time: "2026-11-01T00:00:00Z" }));
  writeFileSync(join(v, "list"), `${VALIDONCE_GO}\n`);
  const env = { ...process.env, ...goEnv(root), GOPROXY: `file://${join(root, "proxy")},https://proxy.golang.org`, GONOSUMDB: mod };
  // warm the caches: the runner as shipped, and a program that uses every package a migration can need
  const run = join(root, "warm-runner");
  cpSync(join(skillsDir, "scripts/run-go"), run, { recursive: true });
  sh("go", ["mod", "tidy"], { cwd: run, env });
  sh("go", ["build", "-o", "/dev/null", "."], { cwd: run, env });
  const use = join(root, "warm-use");
  mkdirSync(use);
  writeFileSync(join(use, "go.mod"), `module warm\n\ngo 1.26\n\nrequire (\n\t${mod} ${VALIDONCE_GO}\n\tgithub.com/go-playground/validator/v10 v10.30.6\n)\n`);
  writeFileSync(join(use, "main.go"), `package main\n\nimport (\n\t_ "encoding/json"\n\t_ "net/http/httptest"\n\t_ "testing"\n\n\t_ "github.com/go-playground/validator/v10"\n\t_ "${mod}"\n\t_ "${mod}/humaonce"\n\t_ "${mod}/playground"\n)\n\nfunc main() {}\n`);
  sh("go", ["mod", "tidy"], { cwd: use, env });
  sh("go", ["build", "-o", "/dev/null", "."], { cwd: use, env });
  // a project that has the validator only (other versions of its dependencies than with validonce)
  const base = join(root, "warm-base");
  mkdirSync(base);
  writeFileSync(join(base, "go.mod"), "module base\n\ngo 1.26\n\nrequire github.com/go-playground/validator/v10 v10.30.6\n");
  writeFileSync(join(base, "main.go"), 'package main\n\nimport _ "github.com/go-playground/validator/v10"\n\nfunc main() {}\n');
  sh("go", ["mod", "tidy"], { cwd: base, env });
  sh("go", ["build", "-o", "/dev/null", "."], { cwd: base, env });
  writeFileSync(join(root, "ready"), "");
  return root;
}

/** A private copy of the Go caches for one run: the agent's sandbox may write only its own directories. */
export function goForRun(runDir) {
  const to = join(runDir, "go");
  if (!existsSync(to)) {
    const from = ensureGo();
    mkdirSync(to, { recursive: true });
    for (const d of ["mod", "build"]) clone(join(from, d), join(to, d));
  }
  return to;
}

/** One directory of jars: Spring, Hibernate Validator, Jackson and the workspace's validonce-core / validonce-spring. */
export function ensureJavaLibs() {
  const libs = join(scratchRoot(), "_javalibs-1");
  if (existsSync(join(libs, "ready"))) return libs;
  const proj = join(scratchRoot(), "_javalibs-project");
  cpSync(join(evalsDir, "exporters/java"), proj, { recursive: true });
  sh(join(repoRoot, "java/gradlew"), ["-q", "-p", proj, "libs", `-Pout=${libs}`, "--no-daemon"]);
  sh(join(repoRoot, "java/gradlew"), ["-q", "-p", join(repoRoot, "java"), ":validonce-core:jar", ":validonce-spring:jar", "--no-daemon"]);
  for (const m of ["validonce-core", "validonce-spring"])
    for (const f of readdirSync(join(repoRoot, "java", m, "build/libs")).filter((n) => /^validonce-\w+-[\d.]+\.jar$/.test(n))) cpSync(join(repoRoot, "java", m, "build/libs", f), join(libs, f));
  writeFileSync(join(libs, "ready"), "");
  return libs;
}

const NOT_SOURCE = new Set([".validonce-scratch", ".claude", ".github", ".mcp.json", "node_modules", "out", "build", "libs"]);
export const copyProject = (from, to) => {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true, filter: (s) => s === from || !NOT_SOURCE.has(basename(s)) });
};

const javaFiles = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".java")).map((e) => join(e.parentPath, e.name));
export function compileJava(project, out) {
  const libs = ensureJavaLibs();
  mkdirSync(out, { recursive: true });
  const r = spawnSync("javac", ["-parameters", "-cp", `${libs}/*`, "-d", out, ...javaFiles(join(project, "src/main/java"))], { encoding: "utf8", timeout: 120_000 });
  return r.status === 0 ? { ok: true, cp: `${libs}/*:${out}` } : { ok: false, error: `javac failed: ${(r.stderr + r.stdout).slice(-400)}` };
}

export function runJava(c, project, inputs, out, scratch) {
  const b = compileJava(project, join(scratch, `java-${basename(project)}`));
  if (!b.ok) return b;
  const p = spawnSync("java", ["-cp", b.cp, join(skillsDir, "scripts/java-runner/Runner.java"), c.runner.model, inputs, out], { encoding: "utf8", timeout: 300_000 });
  return p.status === 0 ? { ok: true, header: (p.stderr.match(/validonce-runner:.*/) ?? [""])[0] } : { ok: false, error: `runner exit ${p.status}: ${p.stderr.slice(-400)}` };
}

export function exportJava(c, project, scratch) {
  const b = compileJava(project, join(scratch, "java-export"));
  if (!b.ok) return { error: b.error };
  const p = spawnSync("java", ["-cp", b.cp, join(evalsDir, "exporters/java/ExportRules.java"), c.export.model], { encoding: "utf8", timeout: 120_000 });
  try { return JSON.parse(p.stdout); } catch { return { error: `exporter failed: ${p.stderr.slice(-400)}` }; }
}

// The Go fixtures' own HTTP handler, called in-process: it is what decides, whatever the migration moved around.
const GO_MAIN = (module) => `package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"

	target "${module}"
)

func main() {
	in, _ := os.Open(os.Args[1])
	out, _ := os.Create(os.Args[2])
	w := bufio.NewWriter(out)
	h := target.Handler()
	sc := bufio.NewScanner(in)
	sc.Buffer(make([]byte, 1<<20), 1<<26)
	for sc.Scan() {
		if len(bytes.TrimSpace(sc.Bytes())) == 0 {
			continue
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("POST", "/", bytes.NewReader(append([]byte(nil), sc.Bytes()...))))
		var body struct{ Fields []string \`json:"fields"\` }
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if body.Fields == nil {
			body.Fields = []string{}
		}
		res := map[string]any{"accept": rec.Code < 400, "paths": body.Fields}
		if rec.Code == 400 || rec.Code >= 500 {
			res["error"] = fmt.Sprint("status ", rec.Code)
		}
		b, _ := json.Marshal(res)
		w.Write(append(b, '\\n'))
	}
	w.Flush()
	fmt.Fprintln(os.Stderr, "validonce-runner: go handler, in process")
}
`;
const goModule = (dir) => /^module\s+(\S+)/m.exec(readFileSync(join(dir, "go.mod"), "utf8"))[1];
const graderGo = () => {
  const root = join(scratchRoot(), `${GO_ROOT}-grader`);
  if (!existsSync(root)) { const from = ensureGo(); mkdirSync(root, { recursive: true }); for (const d of ["mod", "build"]) clone(join(from, d), join(root, d)); }
  return { ...process.env, ...goEnv(root) };
};

export function runGo(project, inputs, out, scratch) {
  const dir = join(scratch, `go-${basename(project)}`);
  copyProject(project, dir);
  mkdirSync(join(dir, "cmd/zzgrader"), { recursive: true });
  writeFileSync(join(dir, "cmd/zzgrader/main.go"), GO_MAIN(goModule(dir)));
  const env = graderGo();
  const b = spawnSync("go", ["build", "-o", "zzgrader", "./cmd/zzgrader"], { cwd: dir, encoding: "utf8", env, timeout: 240_000 });
  if (b.status !== 0) return { ok: false, error: `go build failed: ${b.stderr.slice(-400)}` };
  const p = spawnSync(join(dir, "zzgrader"), [inputs, out], { encoding: "utf8", timeout: 120_000 });
  return p.status === 0 ? { ok: true, header: p.stderr.trim() } : { ok: false, error: `go runner exit ${p.status}: ${p.stderr.slice(-400)}` };
}

export function buildGo(project, scratch) {
  const dir = join(scratch, "go-build");
  copyProject(project, dir);
  // -mod=readonly: the go.mod and go.sum the agent left must be complete
  const r = spawnSync("go", ["vet", "./..."], { cwd: dir, encoding: "utf8", env: { ...graderGo(), GOFLAGS: "-mod=readonly -modcacherw" }, timeout: 240_000 });
  return r.status === 0 ? { ok: true } : { ok: false, error: `go vet failed: ${r.stderr.slice(-400)}` };
}

/** Prints every package-level validonce rule set (var x = validonce.MustBuild / Build) of the root package, from a test in that package. */
export function exportGo(project, scratch) {
  const dir = join(scratch, "go-export");
  copyProject(project, dir);
  const files = readdirSync(dir).filter((f) => f.endsWith(".go"));
  const src = files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  const names = [...new Set([...src.matchAll(/^(?:var\s+)?\s*(\w+)(?:\s*,\s*\w+)?\s*=\s*\w+\.(?:MustBuild|Build)\[/gm)].map((m) => m[1]))].filter((n) => new RegExp(`(^var\\s+${n}\\b|^var\\s*\\([\\s\\S]*?^\\t${n}\\b)`, "m").test(src));
  if (!names.length) return { error: "no package-level validonce rule set (validonce.MustBuild) in the root package" };
  const pkg = /^package\s+(\w+)/m.exec(src)[1];
  writeFileSync(join(dir, "zz_export_test.go"), `package ${pkg}\n\nimport (\n\t"encoding/json"\n\t"os"\n\t"testing"\n)\n\nfunc TestZZExport(t *testing.T) {\n\tout := []any{${names.map((n) => `${n}.Set()`).join(", ")}}\n\tb, _ := json.Marshal(out)\n\t_ = os.WriteFile("zz_export.json", b, 0o644)\n}\n`);
  const r = spawnSync("go", ["test", "-run", "TestZZExport", "."], { cwd: dir, encoding: "utf8", env: graderGo(), timeout: 240_000 });
  if (!existsSync(join(dir, "zz_export.json"))) return { error: `export test failed: ${(r.stdout + r.stderr).slice(-400)}` };
  return { version: 1, rules: JSON.parse(readFileSync(join(dir, "zz_export.json"), "utf8")).flatMap((s) => s.rules) };
}

/** JavaScript project run through run-js.mjs behind a small wrapper module (see c.runner.wrapper in cases.mjs). */
export function wrapJs(project, scratch, wrapper) {
  const dir = join(scratch, `js-${basename(project)}`);
  copyProject(project, dir);
  symlinkSync(join(testbeds, "before/node_modules"), join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, "zz-wrapper.mjs"), wrapper);
  return join(dir, "zz-wrapper.mjs");
}

/** Env a run's agent gets on top of the process env. */
export const agentEnv = (c, runDir) => (c.stack === "go" ? goEnv(goForRun(runDir)) : {});
