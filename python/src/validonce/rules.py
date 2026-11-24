# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

"""Rule format v1 data model and parser."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

FORMAT_VERSION = 1

KINDS = ("required_when", "compare", "at_least_one_of", "exactly_one_of", "all_or_none")

GROUP_KINDS = ("at_least_one_of", "exactly_one_of", "all_or_none")


class ValidonceFormatError(ValueError):
    """Raised when rule data is not a valid version 1 rule set."""


OPS = ("lt", "le", "gt", "ge", "eq", "ne")
TYPES = ("number", "string", "date", "datetime")


def _is_scalar(v: Any) -> bool:
    return isinstance(v, (str, int, float, bool)) and v is not None


def _is_constant(v: Any) -> bool:
    """A compare constant: a string or a number, never a bool (as the schema and C# parser say)."""
    return isinstance(v, str) or (isinstance(v, (int, float)) and not isinstance(v, bool))


def _is_field(v: Any) -> bool:
    return isinstance(v, str) and v != ""


def _check_condition(c: Any, where: str) -> None:
    """Check a condition at parse time (rule-format-v1 "Conditions"), as C# and JS do."""
    if not isinstance(c, dict) or len(c) != 1:
        raise ValidonceFormatError(
            f"{where} must be an object with exactly one key "
            "(eq, ne, in, present, absent, all, any, not)"
        )
    ((op, body),) = c.items()
    b = body if isinstance(body, dict) else None
    if op in ("eq", "ne"):
        if b is None or not _is_field(b.get("field")) or not _is_scalar(b.get("value")):
            raise ValidonceFormatError(
                f"{where}.{op} needs field and a string, number or boolean value"
            )
    elif op == "in":
        vals = b.get("values") if b else None
        if (
            b is None
            or not _is_field(b.get("field"))
            or not isinstance(vals, list)
            or not vals
            or not all(_is_scalar(v) for v in vals)
        ):
            raise ValidonceFormatError(
                f"{where}.in needs field and a non-empty values array of scalars"
            )
    elif op in ("present", "absent"):
        if b is None or not _is_field(b.get("field")):
            raise ValidonceFormatError(f"{where}.{op} needs field")
    elif op in ("all", "any"):
        if not isinstance(body, list) or not body:
            raise ValidonceFormatError(f"{where}.{op} needs a non-empty array of conditions")
        for j, x in enumerate(body):
            _check_condition(x, f"{where}.{op}[{j}]")
    elif op == "not":
        _check_condition(body, f"{where}.not")
    else:
        raise ValidonceFormatError(f"{where}: unknown condition {op!r}")


@dataclass(frozen=True)
class Message:
    key: str
    params: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Rule:
    id: str
    kind: str
    message: Message
    path: str | None = None
    server_only: bool = False
    field: str | None = None
    when: dict[str, Any] | None = None
    left: dict[str, Any] | None = None
    op: str | None = None
    right: dict[str, Any] | None = None
    type: str | None = None
    fields: tuple[str, ...] = ()

    def default_path(self) -> str:
        if self.path is not None:
            return self.path
        if self.kind == "required_when":
            return self.field or ""
        if self.kind == "compare":
            return (self.left or {}).get("field", "")
        return self.fields[0] if self.fields else ""


@dataclass(frozen=True)
class RuleSet:
    version: int
    rules: tuple[Rule, ...]


def parse_rule_set(obj: Any) -> RuleSet:
    """Parse an ``x-validonce`` dict into a RuleSet."""
    if not isinstance(obj, dict):
        raise ValidonceFormatError("x-validonce must be an object")
    version = obj.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version != FORMAT_VERSION:
        raise ValidonceFormatError(f"unsupported version: {version!r}")
    raw_rules = obj.get("rules")
    if not isinstance(raw_rules, list):
        raise ValidonceFormatError("rules must be an array")
    return RuleSet(version=version, rules=tuple(_parse_rule(r) for r in raw_rules))


def _parse_rule(r: Any) -> Rule:
    if not isinstance(r, dict):
        raise ValidonceFormatError("rule must be an object")
    kind = r.get("kind")
    if kind not in KINDS:
        raise ValidonceFormatError(f"unknown rule kind: {kind!r}")
    rid = r.get("id")
    msg = r.get("message")
    if not isinstance(rid, str) or not isinstance(msg, dict) or not isinstance(msg.get("key"), str):
        raise ValidonceFormatError("rule needs id and message.key")
    params = msg.get("params")
    fields = r.get("fields")
    if kind in GROUP_KINDS:
        if (
            not isinstance(fields, list)
            or len(fields) < 2
            or not all(isinstance(f, str) for f in fields)
            or len(set(fields)) != len(fields)
        ):
            raise ValidonceFormatError(
                f"{kind} rule {rid!r} needs fields: at least two distinct field names"
            )
    if kind == "required_when":
        if not _is_field(r.get("field")) or not isinstance(r.get("when"), dict):
            raise ValidonceFormatError(f"required_when rule {rid!r} needs field and when")
        _check_condition(r["when"], f"rule {rid!r} when")
    elif kind == "compare":
        left, right = r.get("left"), r.get("right")
        if not isinstance(left, dict) or not _is_field(left.get("field")):
            raise ValidonceFormatError(f"compare rule {rid!r} needs left.field")
        if r.get("op") not in OPS:
            raise ValidonceFormatError(f"compare rule {rid!r}: unknown op {r.get('op')!r}")
        if r.get("type") not in TYPES:
            raise ValidonceFormatError(f"compare rule {rid!r}: unknown type {r.get('type')!r}")
        if not (
            isinstance(right, dict)
            and len(right) == 1
            and (
                _is_field(right.get("field")) or ("value" in right and _is_constant(right["value"]))
            )
        ):
            raise ValidonceFormatError(
                f"compare rule {rid!r}: right needs exactly one of field or a string/number value"
            )
    return Rule(
        id=rid,
        kind=kind,
        message=Message(key=msg["key"], params=dict(params) if isinstance(params, dict) else {}),
        path=r.get("path"),
        server_only=r.get("server_only") is True,
        field=r.get("field"),
        when=r.get("when"),
        left=r.get("left"),
        op=r.get("op"),
        right=r.get("right"),
        type=r.get("type"),
        fields=tuple(fields or ()),
    )
