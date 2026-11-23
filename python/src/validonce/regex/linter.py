# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Finds regex constructs whose meaning differs between JavaScript, Python re, Rust and .NET."""

from __future__ import annotations

from collections.abc import Iterable

from .scanner import from_utf16, scan, to_utf16
from .types import ENGINE_NAMES, FINDING_BY_ID, PatternFinding

PARSE_ERROR_ID = "VR000"

SAFE_REWRITE_IDS: tuple[str, ...] = (
    "VR001", "VR002", "VR003", "VR006", "VR007", "VR011", "VR012",
    "VR016", "VR018", "VR019", "VR023", "VR025", "VR026",
)  # fmt: skip

_AFFECTED: dict[str, tuple[str, ...]] = {
    "VR007": ("js", "js-u"),
    "VR008": ("python-re", "rust-regex"),
    "VR009": ("rust-regex",),
    "VR010": ("rust-regex",),
    "VR013": ("js", "js-u", "python-re"),
    "VR016": ("python-re", "rust-regex", "dotnet"),
    "VR017": ("js", "python-re"),
    "VR022": ("js-u", "python-re", "rust-regex"),
    "VR025": ("js-u", "rust-regex"),
    "VR026": ("js-u", "dotnet"),
}


def utf16_span_to_py(pattern: str, start: int, length: int) -> tuple[int, int]:
    """Convert a UTF-16 ``(start, length)`` span to Python string ``(start, end)`` indexes."""
    units = 0
    py_start = py_end = len(pattern)
    found_start = False
    for idx, ch in enumerate(pattern):
        if not found_start and units >= start:
            py_start = idx
            found_start = True
        if units >= start + length:
            py_end = idx
            break
        units += 2 if ord(ch) > 0xFFFF else 1
    return py_start, py_end


def lint(pattern: str, engines: Iterable[str] | None = None) -> list[PatternFinding]:
    """Lint one pattern. Never raises on pattern content; unparseable input yields a VR000 finding.

    ``engines`` restricts findings to the named engines (default: all).
    Offsets are UTF-16 code units, like the C# reference implementation.
    """
    wanted: set[str] | None = None
    if engines is not None:
        wanted = set(engines)
        unknown = wanted - set(ENGINE_NAMES)
        if unknown:
            raise ValueError(f"unknown engine(s): {', '.join(sorted(unknown))}")
    p = to_utf16(pattern)
    hits, fail_at = scan(p)
    result: list[PatternFinding] = []
    seen: set[tuple[str, int]] = set()

    for h in hits:
        key = (h.id, h.start)
        if key in seen:
            continue
        seen.add(key)
        info = FINDING_BY_ID[h.id]
        engs = _AFFECTED.get(h.id, ENGINE_NAMES)
        if wanted is not None:
            engs = tuple(e for e in engs if e in wanted)
            if not engs:
                continue
        text = from_utf16(p[h.start : h.start + h.length])
        result.append(
            PatternFinding(
                h.id,
                info.severity,
                h.start,
                h.length,
                info.title,
                f"{info.summary} Found: {text}",
                h.rewrite,
                tuple(engs),
            )
        )

    if fail_at is not None and (PARSE_ERROR_ID, fail_at) not in seen:
        start = min(fail_at, max(0, len(p) - 1))
        engs = ENGINE_NAMES if wanted is None else tuple(e for e in ENGINE_NAMES if e in wanted)
        result.append(
            PatternFinding(
                PARSE_ERROR_ID,
                "error",
                start,
                max(1, len(p) - start),
                "Pattern could not be parsed",
                f"The pattern could not be parsed from index {start}; "
                "engines may reject it or read it differently.",
                None,
                engs,
            )
        )

    result.sort(key=lambda f: (f.start, f.id))
    return result
