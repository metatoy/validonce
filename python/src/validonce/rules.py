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
