# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Compare regex fixtures' expectations with what the real engines return.

Usage:
    check_regex_oracle.py [--fixtures DIR] [--write-actual] RUN.json [RUN.json ...]

Each RUN.json is the output of one runner (js.mjs, py_runner.py, RegexOracle). Exits 1 on any
mismatch, or on any expectation for which no run supplied a result.
`--write-actual` prints fixture-shaped JSON with the actual results; it never writes a file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ENGINES = ("js", "js-u", "python-re", "rust-regex", "dotnet")


def load_fixtures(directory: Path) -> list[tuple[Path, dict]]:
    return [
        (p, json.loads(p.read_text(encoding="utf-8")))
        for p in sorted(directory.iterdir())
        if p.is_file() and p.suffix == ".json"
    ]


def merge_runs(paths: list[str]) -> tuple[dict[str, dict[str, str]], dict[str, str]]:
    results: dict[str, dict[str, str]] = {}
    versions: dict[str, str] = {}
    for path in paths:
        run = json.loads(Path(path).read_text(encoding="utf-8"))
        versions.update(run.get("engine-versions", {}))
        for key, engines in run["results"].items():
            results.setdefault(key, {}).update(engines)
    return results, versions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("runs", nargs="+", help="runner output files")
    parser.add_argument("--fixtures", default=str(REPO / "conformance" / "regex"), help="fixtures directory")
    parser.add_argument("--write-actual", action="store_true", help="print fixture-shaped JSON of actual results")
    args = parser.parse_args()

    fixtures = load_fixtures(Path(args.fixtures))
    results, versions = merge_runs(args.runs)

    if args.write_actual:
        out = []
        for _, doc in fixtures:
            doc = json.loads(json.dumps(doc))
            for case in doc["cases"]:
                for i, inp in enumerate(case["inputs"]):
                    actual = results.get(f"{case['id']}#{i}", {})
                    inp["expect"] = {e: actual[e] for e in ENGINES if e in actual}
            out.append(doc)
        print(json.dumps(out[0] if len(out) == 1 else out, indent=2, ensure_ascii=False))
        return 0

    rows: list[tuple[str, str, str, str, str]] = []
    total = 0
    engines_seen: set[str] = set()
    for _, doc in fixtures:
        for case in doc["cases"]:
            for i, inp in enumerate(case["inputs"]):
                actual = results.get(f"{case['id']}#{i}", {})
                for engine, expected in inp["expect"].items():
                    total += 1
                    engines_seen.add(engine)
                    got = actual.get(engine, "NO RESULT")
                    if got != expected:
                        rows.append((case["id"], repr(inp["text"]), engine, expected, got))

    if rows:
        headers = ("case", "input", "engine", "expected", "actual")
        widths = [max(len(h), *(len(r[c]) for r in rows)) for c, h in enumerate(headers)]
        for line in [headers, *rows]:
            print("  ".join(v.ljust(w) for v, w in zip(line, widths)).rstrip())
    print("engine versions: " + ", ".join(f"{k}={v}" for k, v in sorted(versions.items())))
    if rows:
        print(f"FAIL: {len(rows)} of {total} expectations differ")
        return 1
    print(f"ok: {total} expectations across {len(engines_seen)} engines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
