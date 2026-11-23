# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

import json
from pathlib import Path

import pytest

from validonce import ValidonceFormatError, evaluate, parse_rule_set


def _root() -> Path:
    for p in Path(__file__).resolve().parents:
        if (p / "conformance" / "rules").is_dir():
            return p
    raise RuntimeError("conformance/rules not found")


def _load() -> list[dict]:
    cases = []
    for f in sorted((_root() / "conformance" / "rules").glob("*.json")):
        cases.extend(json.loads(f.read_text(encoding="utf-8"))["cases"])
    return cases


CASES = _load()
PARAMS = [pytest.param(c, s, id=f"{c['id']}-{s}") for c in CASES for s in ("server", "client")]


def test_case_count() -> None:
    assert len(CASES) == 125


@pytest.mark.parametrize(("case", "side"), PARAMS)
def test_case(case: dict, side: str) -> None:
    rs = parse_rule_set({"version": 1, "rules": case["rules"]})
    got = [i.to_dict() for i in evaluate(rs, case["data"], side)]
    expect = case["expect"]
    if side == "client":
        so = {r["id"] for r in case["rules"] if r.get("server_only")}
        expect = [e for e in expect if e["ruleId"] not in so]
    assert got == expect


def test_version_2_rejected() -> None:
    with pytest.raises(ValidonceFormatError):
        parse_rule_set({"version": 2, "rules": []})


def test_bool_version_rejected() -> None:
    with pytest.raises(ValidonceFormatError):
        parse_rule_set({"version": True, "rules": []})


def test_group_rule_needs_two_distinct_fields() -> None:
    for fields in (["x"], ["x", "x"], "xy"):
        with pytest.raises(ValidonceFormatError):
            parse_rule_set(
                {
                    "version": 1,
                    "rules": [
                        {
                            "id": "a",
                            "kind": "all_or_none",
                            "fields": fields,
                            "message": {"key": "k"},
                        }
                    ],
                }
            )


def test_evaluate_accepts_a_rule_list() -> None:
    case = CASES[0]
    rs = parse_rule_set({"version": 1, "rules": case["rules"]})
    from_list = [i.to_dict() for i in evaluate(rs.rules, case["data"])]
    from_set = [i.to_dict() for i in evaluate(rs, case["data"])]
    assert from_list == from_set
