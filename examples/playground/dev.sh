#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
#
# Starts the six example backends, the simulated Kubernetes API server and the playground shell on
# this machine (no Docker), for manual testing. Ctrl-C stops everything.
#   bash examples/playground/dev.sh             all of them
#   bash examples/playground/dev.sh go fastapi  only these backends (k8s and the shell always start)
# Needs dotnet, uv, Go, a JDK, node and pnpm. ASP.NET and Spring take a while to start.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ONLY=("$@")
should() {
  [ "${#ONLY[@]}" -eq 0 ] && return 0
  local b
  for b in "${ONLY[@]}"; do [ "$b" = "$1" ] && return 0; done
  return 1
}

pids=()
trap 'echo; echo "stopping..."; kill "${pids[@]}" 2>/dev/null || true; wait 2>/dev/null || true' EXIT INT TERM

run() { # name, dir, command...
  local name="$1" dir="$2"
  shift 2
  echo "starting $name"
  (cd "$dir" && exec "$@") >"$ROOT/examples/playground/.dev-$name.log" 2>&1 &
  pids+=($!)
}

echo "installing and building (validonce, the four frames)..."
pnpm install --frozen-lockfile >/dev/null
pnpm --filter validonce build >/dev/null
pnpm -r --filter "validonce-playground-frame-*" build >/dev/null

if should aspnet; then run aspnet "$ROOT" dotnet run --project examples/aspnet-app --urls http://localhost:5080; fi
if should fastapi; then run fastapi examples/fastapi-app uv run uvicorn app:app --port 8010; fi
if should fastify; then PORT=8020 run fastify examples/fastify-app pnpm start; fi
if should nestjs; then PORT=8030 run nestjs examples/nestjs-app pnpm start; fi
if should go; then run go examples/go-app go run .; fi
if should spring; then run spring "$ROOT/java" ./gradlew :spring-app:bootRun; fi
run k8s examples/playground/k8s node server.mjs

echo
echo "backend logs: examples/playground/.dev-<name>.log"
echo "playground:   http://localhost:5180/?backend=go&frontend=react"
cd examples/playground/shell
pnpm dev
