# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Data model and findings table for the regex portability linter."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from importlib import resources
from pathlib import Path
from typing import Any

ENGINE_NAMES: tuple[str, ...] = ("js", "js-u", "python-re", "rust-regex", "dotnet")

SEVERITY_RANK = {"info": 0, "warning": 1, "error": 2}


@dataclass(frozen=True)
class PatternFinding:
    """One portability problem found in a pattern.

    ``start`` and ``length`` are UTF-16 code unit offsets (as in the C# reference
    implementation). For BMP-only patterns they equal Python string indexes; use
    :func:`validonce.regex.utf16_span_to_py` to convert otherwise.
    """

    id: str
    severity: str
    start: int
    length: int
    title: str
    message: str
    rewrite: str | None
    engines: tuple[str, ...]


@dataclass(frozen=True)
class FindingInfo:
    """One row of the findings table (docs/regex-findings.json)."""

    id: str
    title: str
    summary: str
    severity: str
    engines: dict[str, str] = field(default_factory=dict)
    rewrite: str | None = None


def _read_table_text() -> str:
    try:
        res = resources.files("validonce.regex").joinpath("regex-findings.json")
        if res.is_file():
            return res.read_text(encoding="utf-8")
    except (ModuleNotFoundError, FileNotFoundError, OSError):
        pass
    # Source tree: python/src/validonce/regex/types.py -> repo/docs/regex-findings.json
    repo_file = Path(__file__).resolve().parents[4] / "docs" / "regex-findings.json"
    return repo_file.read_text(encoding="utf-8")


def _load() -> tuple[FindingInfo, ...]:
    doc: dict[str, Any] = json.loads(_read_table_text())
    out: list[FindingInfo] = []
    for f in doc["findings"]:
        sev = f["severity"] if f["severity"] in ("error", "warning") else "info"
        rw = f.get("rewrite")
        out.append(
            FindingInfo(
                id=f["id"],
                title=f["title"],
                summary=f["summary"],
                severity=sev,
                engines={k: v for k, v in f["engines"].items() if k in ENGINE_NAMES},
                rewrite=rw if isinstance(rw, str) else None,
            )
        )
    return tuple(out)


FINDINGS: tuple[FindingInfo, ...] = _load()
FINDING_BY_ID: dict[str, FindingInfo] = {f.id: f for f in FINDINGS}
