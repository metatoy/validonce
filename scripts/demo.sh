#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
#
# Start the validonce demo: a backend plus a form, wired together through the form's /api proxy.
#   scripts/demo.sh [--backend aspnet|fastapi] [--frontend react|angular]
#   scripts/demo.sh --stop
# Starts both servers in the background, waits until the form answers, prints the form URL and exits.
# Logs and PIDs are kept in .demo/ (untracked scratch; --stop kills the servers).
set -euo pipefail

backend=aspnet
frontend=react
stop=0
while [ $# -gt 0 ]; do
  case "$1" in
    --backend) backend="${2:?--backend needs a value}"; shift 2 ;;
    --frontend) frontend="${2:?--frontend needs a value}"; shift 2 ;;
    --stop) stop=1; shift ;;
    -h|--help) sed -n 5,9p "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$backend" in aspnet|fastapi) ;; *) echo "--backend must be aspnet or fastapi" >&2; exit 2 ;; esac
case "$frontend" in react|angular) ;; *) echo "--frontend must be react or angular" >&2; exit 2 ;; esac

root="$(cd "$(dirname "$0")/.." && pwd)"
state="$root/.demo"
mkdir -p "$state"

stop_all() {
  for f in "$state"/*.pid; do
    [ -e "$f" ] || continue
    pid="$(cat "$f")"
    # Each server runs in its own process group (set -m), so stop the whole group.
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    rm -f "$f"
  done
}

if [ "$stop" = 1 ]; then stop_all; echo "demo stopped"; exit 0; fi
stop_all

# Start a command in its own process group, detached from this shell; record its PID.
spawn() { # name dir cmd...
  local name="$1" dir="$2"; shift 2
  (
    cd "$dir"
    set -m
    nohup "$@" > "$state/$name.log" 2>&1 < /dev/null &
    echo $! > "$state/$name.pid"
  )
}

wait_for() { # url seconds
  for _ in $(seq 1 "$2"); do
    if curl -s -o /dev/null "$1"; then return 0; fi
    sleep 1
  done
  echo "timed out waiting for $1; see $state/*.log" >&2
  return 1
}

if [ "$backend" = aspnet ]; then
  api=http://localhost:5080
  (cd "$root/examples/aspnet-app" && dotnet build -c Release > "$state/aspnet-build.log" 2>&1)
  spawn backend "$root/examples/aspnet-app" dotnet run -c Release --no-build --no-launch-profile --urls "$api"
else
  api=http://localhost:8010
  # Run from the virtual environment, not through `uv run`, so no uv process holds the cache lock.
  (cd "$root/examples/fastapi-app" && uv sync > "$state/fastapi-sync.log" 2>&1)
  spawn backend "$root/examples/fastapi-app" .venv/bin/uvicorn app:app --port 8010
fi
wait_for "$api/" 120

export VALIDONCE_API="$api"
if [ "$frontend" = react ]; then
  port=5173
  spawn frontend "$root/examples/react-form" pnpm exec vite --port 5173 --strictPort --host
else
  port=4200
  spawn frontend "$root/examples/angular-form" pnpm exec ng serve --port 4200 --host 0.0.0.0
fi
wait_for "http://localhost:$port/" 180

echo "validonce demo is up: $frontend form on http://localhost:$port (backend: $backend at $api)"
if [ -n "${CODESPACE_NAME:-}" ]; then
  echo "In this codespace open: https://${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
echo "Stop with: scripts/demo.sh --stop"
