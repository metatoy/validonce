# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Cross-backend check on the golden OpenAPI exports.

The ASP.NET and FastAPI examples implement the same Signup contract, written once in C# and
once in Python. Their exported rules must be identical (as JSON values), and every exported
x-validonce must be valid rule-format v1.

Usage: uv run --project python python scripts/check_golden.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = ROOT / "conformance" / "golden"
SCHEMAS = ROOT / "conformance" / "schema"


def rules_by_schema(doc: dict) -> dict[str, dict]:
    schemas = doc.get("components", {}).get("schemas", {})
    return {name: s["x-validonce"] for name, s in schemas.items() if "x-validonce" in s}


def main() -> int:
    loaded = {
        p.name: json.loads((SCHEMAS / p.name).read_text(encoding="utf-8"))
        for p in SCHEMAS.glob("*.schema.json")
    }
    registry = Registry().with_resources(
        (s["$id"], Resource.from_contents(s)) for s in loaded.values()
    )
    validator = Draft202012Validator(
        loaded["rule-format-v1.schema.json"], registry=registry
    )

    exports = {
        p.stem.removesuffix(".openapi"): rules_by_schema(
            json.loads(p.read_text(encoding="utf-8"))
        )
        for p in sorted(GOLDEN.glob("*.openapi.json"))
    }
    problems: list[str] = []
    if set(exports) != {"aspnet", "fastapi"}:
        problems.append(f"expected aspnet and fastapi exports, found {sorted(exports)}")

    for backend, by_schema in exports.items():
        if "Signup" not in by_schema:
            problems.append(f"{backend}: no x-validonce on Signup")
        for name, rules in by_schema.items():
            for err in validator.iter_errors(rules):
                problems.append(f"{backend}/{name}: {err.message}")

    if not problems and exports["aspnet"]["Signup"] != exports["fastapi"]["Signup"]:
        problems.append(
            "Signup rules differ between backends:\n"
            f"  aspnet:  {json.dumps(exports['aspnet']['Signup'], sort_keys=True)}\n"
            f"  fastapi: {json.dumps(exports['fastapi']['Signup'], sort_keys=True)}"
        )

    for p in problems:
        print(f"FAIL {p}")
    if problems:
        return 1
    n = len(exports["aspnet"]["Signup"]["rules"])
    print(
        f"ok: Signup rules identical across aspnet and fastapi ({n} rules), all valid v1"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
