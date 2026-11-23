#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
# Golden check for generate_code: generate -> compile/import -> export -> compare.
set -euo pipefail
cd "$(dirname "$0")"
out="$PWD/out"
npx esbuild generate.ts --bundle --format=esm --platform=node --outfile="$out/generate.mjs" --log-level=warning
node "$out/generate.mjs"
dotnet run --project ../golden-csharp -- "$out/csharp-export.json"
uv run --project ../../../python python ../golden-python/export.py "$out/python" "$out/python-export.json"
node compare.mjs "$out/units.json" "$out/csharp-export.json" "$out/python-export.json"
