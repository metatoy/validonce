#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
# usage: run.sh <signup|contact> <inputs.jsonl> <out.jsonl> <scratch-dir>
# Resolves the runner's libraries once per scratch dir, compiles the fixture, runs the runner.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
c="$1" in="$2" out="$3" scratch="$4"
cls="$(echo "${c:0:1}" | tr a-z A-Z)${c:1}"
r="$scratch/java-runner"
if [ ! -d "$r/libs" ]; then
  cp -R "$here/../../../skills/validonce-migrate/scripts/java-runner" "$r"
  (cd "$r" && gradle -q libs --no-daemon)
fi
mkdir -p "$r/classes-$c"
javac -cp "$r/libs/*" -d "$r/classes-$c" "$here/$c/$cls.java"
java -cp "$r/libs/*:$r/classes-$c" "$r/Runner.java" "$cls" "$in" "$out"
