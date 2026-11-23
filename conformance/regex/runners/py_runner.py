# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Runs regex fixtures on Python's `re` and on Pydantic's default pattern engine (Rust regex).

Usage: uv run --project python python conformance/regex/runners/py_runner.py <fixtures-dir>
Prints one JSON object to stdout.
"""

from __future__ import annotations

import json
import re
import sys
from importlib.metadata import version
from pathlib import Path
from typing import Annotated

from pydantic import Field, TypeAdapter, ValidationError


def run_python_re(pattern: str, text: str) -> str:
    try:
        compiled = re.compile(pattern)
    except re.error:
        return "error"
    return "match" if compiled.search(text) is not None else "no-match"


def run_rust(pattern: str, text: str) -> str:
    try:
        adapter = TypeAdapter(Annotated[str, Field(pattern=pattern)])
    except Exception:
        return "error"
    try:
        adapter.validate_python(text)
    except ValidationError:
        return "no-match"
    return "match"


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: py_runner.py <fixtures-dir>", file=sys.stderr)
        return 2
    results: dict[str, dict[str, str]] = {}
    for path in sorted(p for p in Path(sys.argv[1]).iterdir() if p.is_file() and p.suffix == ".json"):
        doc = json.loads(path.read_text(encoding="utf-8"))
        for case in doc["cases"]:
            for i, inp in enumerate(case["inputs"]):
                results[f"{case['id']}#{i}"] = {
                    "python-re": run_python_re(case["pattern"], inp["text"]),
                    "rust-regex": run_rust(case["pattern"], inp["text"]),
                }
    versions = {
        "python": sys.version.split()[0],
        "pydantic": version("pydantic"),
        "pydantic-core": version("pydantic-core"),
    }
    sys.stdout.write(json.dumps({"engine-versions": versions, "results": results}) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
