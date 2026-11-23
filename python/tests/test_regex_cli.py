# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""CLI tests: output must be byte-identical to the C# tool (captured in regex_parity.json)."""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest

from validonce.cli import run

DATA = Path(__file__).parent / "data"
PARITY = json.loads((DATA / "regex_parity.json").read_text(encoding="utf-8"))["cli"]
SAMPLE = str(DATA / "openapi_sample.json")


def _run(args, stdin=""):
    out, err = io.StringIO(), io.StringIO()
    code = run(args, out, err, io.StringIO(stdin))
    return out.getvalue(), err.getvalue(), code


@pytest.mark.parametrize("name", sorted(PARITY))
def test_byte_identical_to_csharp(name):
    entry = PARITY[name]
    args = [SAMPLE if a == "SAMPLE" else a for a in entry["args"]]
    out, err, code = _run(args)
    assert out == entry["stdout"]
    assert err == entry["stderr"]
    assert code == entry["exit"]


def test_exit_codes():
    assert _run(["lint-regex", "--pattern", "^\\w+$"])[2] == 1
    assert _run(["lint-regex", "--pattern", "a$"])[2] == 0
    assert _run(["lint-regex", "--pattern", "a$", "--fail-on", "warning"])[2] == 1
    assert _run(["lint-regex", "--pattern", "^\\w+$", "--fail-on", "never"])[2] == 0
    assert _run(["lint-regex", "--pattern", "^\\w+$", "--ignore", "VR001"])[2] == 0
    assert _run([])[2] == 2
    assert _run(["--help"])[2] == 0
    assert _run(["lint-regex"])[2] == 2
    assert _run(["lint-regex", "/no/such/file.json"])[2] == 2


def test_stdin_and_invalid_json():
    doc = '{"a": {"pattern": "\\\\d+"}} // trailing comment'
    out, _, code = _run(["lint-regex", "-", "--format", "json"], doc)
    assert code == 1
    assert json.loads(out)["patterns"][0]["location"] == "/a/pattern"
    assert _run(["lint-regex", "-"], "{nope")[2] == 2


def test_openapi_skips_data_subtrees():
    out, _, _ = _run(["lint-regex", SAMPLE, "--format", "json", "--fail-on", "never"])
    locations = [p["location"] for p in json.loads(out)["patterns"]]
    assert not any(seg in loc for loc in locations for seg in ("/example", "/default", "/enum"))
    assert any(
        loc.endswith("/patternProperties/^x-~1d+$") or "patternProperties" in loc
        for loc in locations
    )


def test_version():
    out, _, code = _run(["--version"])
    assert code == 0 and out.strip()
