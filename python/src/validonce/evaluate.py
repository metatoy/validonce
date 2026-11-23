# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

"""Evaluator for rule format v1 (required_when and compare kinds)."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

from .rules import Rule, RuleSet, ValidonceFormatError

_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_DT_RE = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?"
    r"(?:Z|([+-])(\d{2}):(\d{2}))$"
)


@dataclass(frozen=True)
class Issue:
    path: tuple[str, ...]
    rule_id: str
    key: str
    params: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": list(self.path),
            "ruleId": self.rule_id,
            "key": self.key,
            "params": dict(self.params),
        }


def _is_blank(v: Any) -> bool:
    return v is None or (isinstance(v, (str, list)) and len(v) == 0)


def _is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _strict_eq(a: Any, b: Any) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if _is_num(a) and _is_num(b):
        return float(a) == float(b)
    if isinstance(a, str) and isinstance(b, str):
        return a == b
    return False


def _cond(c: Mapping[str, Any], data: Mapping[str, Any]) -> bool:
    ((name, arg),) = c.items()
    if name == "eq":
        return _strict_eq(data.get(arg["field"]), arg["value"])
    if name == "ne":
        return not _strict_eq(data.get(arg["field"]), arg["value"])
    if name == "in":
        v = data.get(arg["field"])
        return any(_strict_eq(v, x) for x in arg["values"])
    if name == "present":
        return not _is_blank(data.get(arg["field"]))
    if name == "absent":
        return _is_blank(data.get(arg["field"]))
    if name == "all":
        return all(_cond(x, data) for x in arg)
    if name == "any":
        return any(_cond(x, data) for x in arg)
    if name == "not":
        return not _cond(arg, data)
    raise ValueError(f"unknown condition: {name}")


def _parse_date(v: Any) -> int | None:
    if not isinstance(v, str):
        return None
    m = _DATE_RE.match(v)
    if not m:
        return None
    try:
        return date(int(m[1]), int(m[2]), int(m[3])).toordinal()
    except ValueError:
        return None


def _parse_datetime(v: Any) -> int | None:
    """Return the instant in milliseconds, or None when the type check fails."""
    if not isinstance(v, str):
        return None
    m = _DT_RE.match(v)
    if not m:
        return None
    days = _parse_date(v[:10])
    if days is None:
        return None
    hh, mm, ss = int(m[4]), int(m[5]), int(m[6])
    if hh > 23 or mm > 59 or ss > 59:
        return None
    millis = int((m[7] or "")[:3].ljust(3, "0"))
    offset = 0
    if m[8]:
        oh, om = int(m[9]), int(m[10])
        if oh > 23 or om > 59:
            return None
        offset = (oh * 60 + om) * (1 if m[8] == "+" else -1)
    seconds = days * 86400 + hh * 3600 + mm * 60 + ss - offset * 60
    return seconds * 1000 + millis


def _coerce(type_: str, v: Any) -> Any:
    """Return a comparable value, or None if the type check fails."""
    if type_ == "number":
        return float(v) if _is_num(v) else None
    if type_ == "string":
        return v if isinstance(v, str) else None
    if type_ == "date":
        return _parse_date(v)
    if type_ == "datetime":
        return _parse_datetime(v)
    return None


def _compare(rule: Rule, data: Mapping[str, Any]) -> bool:
    """Return True when the rule fails."""
    if rule.left is None or rule.right is None:
        raise ValidonceFormatError(f"compare rule {rule.id!r} needs left and right")
    left = data.get(rule.left["field"])
    right = data.get(rule.right["field"]) if "field" in rule.right else rule.right.get("value")
    if _is_blank(left) or _is_blank(right):
        return False
    t = rule.type or ""
    a, b = _coerce(t, left), _coerce(t, right)
    if a is None or b is None:
        return False
    op = rule.op
    if op == "lt":
        ok = a < b
    elif op == "le":
        ok = a <= b
    elif op == "gt":
        ok = a > b
    elif op == "ge":
        ok = a >= b
    elif op == "eq":
        ok = a == b
    elif op == "ne":
        ok = a != b
    else:
        raise ValueError(f"unknown op: {op}")
    return not ok


def evaluate(
    rules: RuleSet | Sequence[Rule],
    data: Mapping[str, Any],
    side: Literal["server", "client"] = "server",
) -> list[Issue]:
    """Evaluate rules (a parsed RuleSet, or its list of rules) against wire-form data."""
    issues: list[Issue] = []
    for rule in rules.rules if isinstance(rules, RuleSet) else rules:
        if side == "client" and rule.server_only:
            continue
        if rule.kind == "required_when":
            if rule.when is None or rule.field is None:
                raise ValidonceFormatError(f"required_when rule {rule.id!r} needs field and when")
            failed = _cond(rule.when, data) and _is_blank(data.get(rule.field))
        elif rule.kind == "compare":
            failed = _compare(rule, data)
        else:
            raise NotImplementedError(f"{rule.kind} is not implemented yet")
        if failed:
            issues.append(
                Issue(
                    path=(rule.default_path(),),
                    rule_id=rule.id,
                    key=rule.message.key,
                    params=dict(rule.message.params),
                )
            )
    return issues
