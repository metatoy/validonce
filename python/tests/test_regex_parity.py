# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Parity of the Python regex linter with the C# reference (see regex_parity.json)."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import pytest

from validonce.regex import FINDINGS, SAFE_REWRITE_IDS, lint, utf16_span_to_py

DATA = Path(__file__).parent / "data"
PARITY = json.loads((DATA / "regex_parity.json").read_text(encoding="utf-8"))


def _is_portable_control(case) -> bool:
    """A fixture case where all five engines agree on every input (e.g. rx-038, plain \\uXXXX).
    The linter must stay silent on its finding, exactly as the C# conformance test requires."""
    return all(len(set(i["expect"].values())) == 1 for i in case["inputs"])


def _as_json(findings):
    out = []
    for f in findings:
        d = asdict(f)
        d["engines"] = list(f.engines)
        out.append(d)
    return out


def test_case_count():
    assert len(PARITY["cases"]) >= 340


def test_matches_csharp_exactly():
    mismatches = [
        c["pattern"] for c in PARITY["cases"] if _as_json(lint(c["pattern"])) != c["findings"]
    ]
    assert mismatches == []


@pytest.mark.parametrize(
    "path", sorted((Path(__file__).parents[2] / "conformance/regex").glob("*.json"))
)
def test_fixture_patterns_flagged(path):
    for case in json.loads(path.read_text(encoding="utf-8"))["cases"]:
        ids = {f.id for f in lint(case["pattern"])}
        if _is_portable_control(case):
            assert case["finding"] not in ids, (case["id"], case["pattern"], ids)
        else:
            assert case["finding"] in ids, (case["id"], case["pattern"], ids)


def test_never_raises_on_garbage():
    for p in ["", "\\", "(((", "[[[", "{", "\ud800", "a\x00b", "(?", "(?P", "\\k", "[a-"]:
        lint(p)


def test_clean_patterns_have_no_findings():
    for p in ["^[A-Za-z0-9_]+", "abc", "", "a{2,}?", "(ab)(cd)"]:
        assert lint(p) == []


def test_engine_filter():
    f = lint("(?<=a)b", engines=["js"])
    assert f == []
    assert [x.id for x in lint("(?<=a)b", engines=["rust-regex"])] == ["VR008"]
    with pytest.raises(ValueError):
        lint("a", engines=["perl"])


def test_findings_table_and_safe_ids():
    assert len(FINDINGS) == 25
    assert SAFE_REWRITE_IDS == (
        "VR001", "VR002", "VR003", "VR006", "VR007", "VR011", "VR012",
        "VR016", "VR018", "VR019", "VR023", "VR025", "VR026",
    )  # fmt: skip
    assert {f.id for f in FINDINGS} == {
        f["id"]
        for f in json.loads((Path(__file__).parents[2] / "docs/regex-findings.json").read_text())[
            "findings"
        ]
    }


def test_utf16_span_to_py():
    pat = "\U0001f600\\w"
    (f,) = [x for x in lint(pat) if x.id == "VR001"]
    assert (f.start, f.length) == (2, 2)
    s, e = utf16_span_to_py(pat, f.start, f.length)
    assert pat[s:e] == "\\w"
    assert utf16_span_to_py("ab", 1, 1) == (1, 2)
