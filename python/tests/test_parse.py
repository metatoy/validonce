# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

"""Malformed rules are format errors at parse time, never a crash inside evaluate()."""

import pytest

from validonce.rules import ValidonceFormatError, parse_rule_set


def rw(when):
    return {
        "version": 1,
        "rules": [
            {
                "id": "R",
                "kind": "required_when",
                "field": "company",
                "when": when,
                "message": {"key": "k"},
            }
        ],
    }


def cmp(**extra):
    rule = {
        "id": "C",
        "kind": "compare",
        "left": {"field": "end"},
        "op": "ge",
        "right": {"field": "start"},
        "type": "date",
        "message": {"key": "k"},
    }
    rule.update(extra)
    return {"version": 1, "rules": [rule]}


@pytest.mark.parametrize(
    "when",
    [
        {"op": "eq", "field": "plan", "value": "pro"},
        {"eq": {"field": "plan"}},
        {"eq": {"field": "plan", "value": None}},
        {"eq": {"field": "plan", "value": "pro"}, "ne": {"field": "plan", "value": "x"}},
        {"in": {"field": "plan", "values": []}},
        {"present": {}},
        {"all": []},
        {"any": [{"bogus": {}}]},
        {"not": {"eq": {"field": "", "value": 1}}},
    ],
)
def test_rejects_malformed_conditions(when):
    with pytest.raises(ValidonceFormatError):
        parse_rule_set(rw(when))


def test_accepts_every_condition_shape():
    ok = {
        "all": [
            {"eq": {"field": "a", "value": "x"}},
            {"ne": {"field": "a", "value": 1}},
            {"in": {"field": "a", "values": [True, "y"]}},
            {"any": [{"present": {"field": "b"}}, {"absent": {"field": "c"}}]},
            {"not": {"eq": {"field": "d", "value": False}}},
        ]
    }
    parse_rule_set(rw(ok))


@pytest.mark.parametrize(
    "extra",
    [
        {"op": "gte"},
        {"type": "time"},
        {"right": {"field": "start", "value": 1}},
        {"right": {}},
        {"right": {"value": None}},
    ],
)
def test_rejects_bad_compare(extra):
    with pytest.raises(ValidonceFormatError):
        parse_rule_set(cmp(**extra))


def test_accepts_compare_with_constant():
    parse_rule_set(cmp(right={"value": "2024-01-01"}))
