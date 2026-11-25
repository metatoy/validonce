#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
# Golden check for the go, java, typescript-rules, vue and dom targets:
# generate -> compile (go build/vet, javac via Gradle, tsc, vue-tsc) -> run and export -> compare.
# Needs: pnpm install + js build, Go, JDK 21. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")"
out="$PWD/out-targets"
npx esbuild generate-targets.ts --bundle --format=esm --platform=node --outfile="$PWD/out-targets.generate.mjs" --log-level=warning
node out-targets.generate.mjs
rm -f out-targets.generate.mjs

echo "== go build, vet, run"
(cd "$out/go" && go mod tidy >/dev/null && go build ./... && go vet ./... && go run . > "$out/go-export.json")

echo "== typescript: tsc (fastify, nestjs, vue composables, dom)"
npx tsc -p tsconfig.targets.json
echo "== vue-tsc (single-file components)"
pnpm --dir ../../../examples/vue-form exec vue-tsc --noEmit -p "$PWD/tsconfig.vue.json"

echo "== typescript: bundle and export"
NODE_PATH="$PWD/../../../examples/fastify-app/node_modules:$PWD/../../../examples/nestjs-app/node_modules:$PWD/../../../examples/vue-form/node_modules:$PWD/../../node_modules" \
  npx esbuild "$out/ts/export-entry.ts" --bundle --format=esm --platform=node --outfile="$out/ts-export.mjs" --tsconfig="$out/ts/tsconfig.json" --log-level=warning \
  "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
node "$out/ts-export.mjs" > "$out/ts-export.json"

echo "== java: compile and run through Gradle"
"$PWD/../../../java/gradlew" -p "$PWD/../../../java" --no-daemon -q :codegen-golden:run --args="$out/java-export.json"

node compare-targets.mjs "$out/units.json" "$out/go-export.json" "$out/java-export.json" "$out/ts-export.json"
