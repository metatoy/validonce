# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

"""Author validonce rules on a Pydantic model.

Rules are declared in ``__rules__`` with the ``F`` / ``when`` builders. The model translates
them to rule format v1 (wire names, inferred types, derived ids), enforces them in an
after-validator, and publishes them as ``x-validonce`` in its JSON Schema.
"""

from __future__ import annotations

import datetime as _dt
import decimal
import enum
import types
import typing
from collections.abc import Iterable, Mapping
from copy import deepcopy
from typing import Any, ClassVar, Union

from pydantic import AwareDatetime, BaseModel, ValidationError, model_validator
from pydantic.fields import FieldInfo
from pydantic_core import PydanticCustomError

from .evaluate import _parse_date, _parse_datetime, evaluate
from .rules import FORMAT_VERSION, GROUP_KINDS, RuleSet, parse_rule_set

__all__ = [
    "F",
    "FieldRef",
    "ValidonceDefinitionError",
    "ValidonceModel",
    "all_or_none",
    "all_of",
    "any_of",
    "at_least_one_of",
    "exactly_one_of",
    "not_",
    "when",
]

_TEXT = "_text"  # python-side message text; never exported
_NoneType = type(None)


class ValidonceDefinitionError(TypeError):
    """A ValidonceModel declares rules that cannot be exported (raised at class definition)."""


# --------------------------------------------------------------------------- builders


def _scalar(value: Any, *, where: str) -> Any:
    """Convert a Python value to a rule-format scalar (string, number or boolean)."""
    if isinstance(value, enum.Enum):
        value = value.value
    if isinstance(value, bool) or isinstance(value, (str, int, float)):
        return value
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, _dt.datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValidonceDefinitionError(f"{where}: naive datetime {value!r} has no offset")
        return value.isoformat()
    if isinstance(value, _dt.date):
        return value.isoformat()
    if value is None:
        raise ValidonceDefinitionError(f"{where}: null is not allowed; use .absent() / .present()")
    raise ValidonceDefinitionError(f"{where}: {value!r} is not a string, number or boolean")


def _name(field: Any) -> str:
    if isinstance(field, FieldRef):
        return field.name
    if isinstance(field, str):
        return field
    raise ValidonceDefinitionError(f"expected a field reference (F.name), got {field!r}")


def _message(key: str, params: Mapping[str, Any] | None, text: str | None) -> dict[str, Any]:
    msg: dict[str, Any] = {"key": key}
    if params is not None:
        msg["params"] = dict(params)
    out: dict[str, Any] = {"message": msg}
    if text is not None:
        out[_TEXT] = text
    return out


def _common(
    rule: dict[str, Any],
    *,
    id: str | None,
    server_only: bool,
    path: str | FieldRef | None,
) -> dict[str, Any]:
    if id is not None:
        rule["id"] = id
    if path is not None:
        rule["path"] = _name(path)
    if server_only:
        rule["server_only"] = True
    return rule


class FieldRef:
    """A reference to a model field by attribute name (``F.plan``)."""

    __slots__ = ("name",)
    __hash__ = None  # type: ignore[assignment]  # __eq__ builds a condition

    def __init__(self, name: str) -> None:
        self.name = name

    def __repr__(self) -> str:
        return f"F.{self.name}"

    # conditions
    def __eq__(self, value: object) -> dict[str, Any]:  # type: ignore[override]
        return {"eq": {"field": self.name, "value": _scalar(value, where=f"F.{self.name} ==")}}

    def __ne__(self, value: object) -> dict[str, Any]:  # type: ignore[override]
        return {"ne": {"field": self.name, "value": _scalar(value, where=f"F.{self.name} !=")}}

    def is_in(self, values: Iterable[Any]) -> dict[str, Any]:
        items = [_scalar(v, where=f"F.{self.name}.is_in") for v in values]
        if not items:
            raise ValidonceDefinitionError(f"F.{self.name}.is_in needs at least one value")
        return {"in": {"field": self.name, "values": items}}

    def present(self) -> dict[str, Any]:
        return {"present": {"field": self.name}}

    def absent(self) -> dict[str, Any]:
        return {"absent": {"field": self.name}}

    # compare rules
    def _compare(
        self,
        op: str,
        other: Any,
        key: str,
        params: Mapping[str, Any] | None,
        id: str | None,
        server_only: bool,
        path: str | FieldRef | None,
        message: str | None,
        type: str | None,
    ) -> dict[str, Any]:
        if isinstance(other, FieldRef):
            right: dict[str, Any] = {"field": other.name}
        else:
            right = {"value": _scalar(other, where=f"F.{self.name}.{op}")}
        rule: dict[str, Any] = {
            "kind": "compare",
            "left": {"field": self.name},
            "op": op,
            "right": right,
        }
        if type is not None:
            rule["type"] = type
        rule.update(_message(key, params, message))
        return _common(rule, id=id, server_only=server_only, path=path)

    def lt(self, other: Any, *, key: str, params=None, id=None, server_only=False, path=None,
           message=None, type=None) -> dict[str, Any]:  # fmt: skip
        return self._compare("lt", other, key, params, id, server_only, path, message, type)

    def le(self, other: Any, *, key: str, params=None, id=None, server_only=False, path=None,
           message=None, type=None) -> dict[str, Any]:  # fmt: skip
        return self._compare("le", other, key, params, id, server_only, path, message, type)

    def gt(self, other: Any, *, key: str, params=None, id=None, server_only=False, path=None,
           message=None, type=None) -> dict[str, Any]:  # fmt: skip
        return self._compare("gt", other, key, params, id, server_only, path, message, type)

    def ge(self, other: Any, *, key: str, params=None, id=None, server_only=False, path=None,
           message=None, type=None) -> dict[str, Any]:  # fmt: skip
        return self._compare("ge", other, key, params, id, server_only, path, message, type)

    def eq(self, other: Any, *, key: str, params=None, id=None, server_only=False, path=None,
           message=None, type=None) -> dict[str, Any]:  # fmt: skip
        return self._compare("eq", other, key, params, id, server_only, path, message, type)

    def ne(self, other: Any, *, key: str, params=None, id=None, server_only=False, path=None,
           message=None, type=None) -> dict[str, Any]:  # fmt: skip
        return self._compare("ne", other, key, params, id, server_only, path, message, type)


class _FieldFactory:
    """``F.plan`` and ``F["plan"]`` both give ``FieldRef("plan")``."""

    def __getattr__(self, name: str) -> FieldRef:
        if name.startswith("__"):
            raise AttributeError(name)
        return FieldRef(name)

    def __getitem__(self, name: str) -> FieldRef:
        return FieldRef(name)


F = _FieldFactory()


def all_of(*conditions: dict[str, Any]) -> dict[str, Any]:
    if not conditions:
        raise ValidonceDefinitionError("all_of needs at least one condition")
    return {"all": list(conditions)}


def any_of(*conditions: dict[str, Any]) -> dict[str, Any]:
    if not conditions:
        raise ValidonceDefinitionError("any_of needs at least one condition")
    return {"any": list(conditions)}


def not_(condition: dict[str, Any]) -> dict[str, Any]:
    return {"not": condition}


class _When:
    def __init__(self, condition: dict[str, Any]) -> None:
        self._condition = condition

    def require(
        self,
        field: FieldRef | str,
        *,
        key: str,
        params: Mapping[str, Any] | None = None,
        id: str | None = None,
        server_only: bool = False,
        path: FieldRef | str | None = None,
        message: str | None = None,
    ) -> dict[str, Any]:
        rule: dict[str, Any] = {
            "kind": "required_when",
            "field": _name(field),
            "when": self._condition,
        }
        rule.update(_message(key, params, message))
        return _common(rule, id=id, server_only=server_only, path=path)


def when(condition: dict[str, Any]) -> _When:
    return _When(condition)


def _group(
    kind: str,
    fields: tuple[Any, ...],
    key: str,
    params: Mapping[str, Any] | None,
    id: str | None,
    server_only: bool,
    path: FieldRef | str | None,
    message: str | None,
) -> dict[str, Any]:
    rule: dict[str, Any] = {"kind": kind, "fields": [_name(f) for f in fields]}
    rule.update(_message(key, params, message))
    return _common(rule, id=id, server_only=server_only, path=path)


def at_least_one_of(
    *fields: FieldRef | str,
    key: str,
    params: Mapping[str, Any] | None = None,
    id: str | None = None,
    server_only: bool = False,
    path: FieldRef | str | None = None,
    message: str | None = None,
) -> dict[str, Any]:
    """Fails when every listed field is blank."""
    return _group("at_least_one_of", fields, key, params, id, server_only, path, message)


def exactly_one_of(
    *fields: FieldRef | str,
    key: str,
    params: Mapping[str, Any] | None = None,
    id: str | None = None,
    server_only: bool = False,
    path: FieldRef | str | None = None,
    message: str | None = None,
) -> dict[str, Any]:
    """Fails unless exactly one listed field is non-blank."""
    return _group("exactly_one_of", fields, key, params, id, server_only, path, message)


def all_or_none(
    *fields: FieldRef | str,
    key: str,
    params: Mapping[str, Any] | None = None,
    id: str | None = None,
    server_only: bool = False,
    path: FieldRef | str | None = None,
    message: str | None = None,
) -> dict[str, Any]:
    """Fails when some, but not all, listed fields are blank."""
    return _group("all_or_none", fields, key, params, id, server_only, path, message)


# ------------------------------------------------------------------- field inspection


def _wire_name(cls: type[BaseModel], name: str, info: FieldInfo) -> str:
    if info.serialization_alias:
        return info.serialization_alias
    if info.alias:
        return info.alias
    gen = cls.model_config.get("alias_generator")
    if gen is not None:  # defensive: generator not yet applied to the FieldInfo
        fn = getattr(gen, "serialization_alias", None) or (gen if callable(gen) else None)
        if fn is not None:
            try:
                return str(fn(name))
            except Exception:  # noqa: BLE001
                pass
    return name


def _loc_name(name: str, info: FieldInfo, wire: str) -> str:
    va = info.validation_alias
    if isinstance(va, str):
        return va
    choices = getattr(va, "choices", None)  # AliasChoices
    if choices:
        for c in choices:
            if isinstance(c, str):
                return c
    if info.alias:
        return info.alias
    return name if wire == name else (wire if va is None and info.serialization_alias else name)


def _unwrap(ann: Any) -> Any:
    """Strip Annotated and Optional; error on genuine unions."""
    while True:
        origin = typing.get_origin(ann)
        if origin is typing.Annotated:
            ann = typing.get_args(ann)[0]
            continue
        if origin is Union or origin is getattr(types, "UnionType", object()):
            args = [a for a in typing.get_args(ann) if a is not _NoneType]
            if len(args) != 1:
                raise ValidonceDefinitionError("union of several types")
            ann = args[0]
            continue
        return ann


def _infer_type(info: FieldInfo, where: str) -> str:
    try:
        ann = _unwrap(info.annotation)
    except ValidonceDefinitionError:
        raise ValidonceDefinitionError(
            f"{where}: cannot infer a compare type from a union; pass type="
        ) from None
    if ann is AwareDatetime:
        return "datetime"
    if typing.get_origin(ann) is typing.Literal:
        kinds = {
            "string" if isinstance(a, str) else "number"
            for a in typing.get_args(ann)
            if not isinstance(a, (bool, enum.Enum, bytes, _NoneType))
        }
        if len(kinds) == 1 and len(kinds) == len(
            {type(a) for a in typing.get_args(ann)} & {str, int}
        ):
            return kinds.pop()
        raise ValidonceDefinitionError(f"{where}: Literal values must be all str or all int")
    if isinstance(ann, type):
        if issubclass(ann, bool):
            raise ValidonceDefinitionError(
                f"{where}: bool is not a number (rule format pinned behavior 3); "
                "compare a bool with == in a condition instead"
            )
        if issubclass(ann, enum.Enum):
            raise ValidonceDefinitionError(
                f"{where}: enum fields cannot be compared; use a Literal or pass type="
            )
        if issubclass(ann, decimal.Decimal):
            raise ValidonceDefinitionError(
                f"{where}: Decimal serializes to a JSON string in Pydantic, so the wire value is "
                "not a number; use float/int, or a str field with type='string'"
            )
        if issubclass(ann, (int, float)):
            return "number"
        if issubclass(ann, str):
            return "string"
        if issubclass(ann, _dt.datetime):
            if any(getattr(m, "tz", None) is not None for m in info.metadata):
                return "datetime"
            raise ValidonceDefinitionError(
                f"{where}: datetime fields must be timezone-aware (use pydantic.AwareDatetime). "
                "A naive datetime serializes without an offset, which fails the datetime type "
                "check, so the compare rule would silently never fire"
            )
        if issubclass(ann, _dt.date):
            return "date"
    raise ValidonceDefinitionError(
        f"{where}: unsupported type {ann!r} for compare; supported: int, float, str, date, "
        "AwareDatetime, Literal; pass type= to override"
    )


# ------------------------------------------------------------------------ translation


class _Resolver:
    def __init__(self, cls: type[BaseModel]) -> None:
        self.cls = cls
        self.name = cls.__name__
        self.wire: dict[str, str] = {}
        self.info: dict[str, FieldInfo] = {}
        self.loc: dict[str, str] = {}  # wire name -> error loc
        for attr, info in cls.model_fields.items():
            w = _wire_name(cls, attr, info)
            self.wire[attr] = w
            self.info[attr] = info
            self.loc[w] = _loc_name(attr, info, w)

    def field(self, attr: Any, where: str) -> str:
        if not isinstance(attr, str) or attr not in self.wire:
            known = ", ".join(sorted(self.wire))
            raise ValidonceDefinitionError(
                f"{self.name}: {where} refers to unknown field {attr!r} (fields: {known})"
            )
        return self.wire[attr]

    def condition(self, c: Any, where: str) -> dict[str, Any]:
        if not isinstance(c, dict) or len(c) != 1:
            raise ValidonceDefinitionError(f"{self.name}: {where}: bad condition {c!r}")
        ((op, arg),) = c.items()
        if op in ("eq", "ne"):
            return {op: {"field": self.field(arg["field"], where), "value": arg["value"]}}
        if op == "in":
            return {"in": {"field": self.field(arg["field"], where), "values": list(arg["values"])}}
        if op in ("present", "absent"):
            return {op: {"field": self.field(arg["field"], where)}}
        if op in ("all", "any"):
            return {op: [self.condition(x, where) for x in arg]}
        if op == "not":
            return {"not": self.condition(arg, where)}
        raise ValidonceDefinitionError(f"{self.name}: {where}: unknown condition {op!r}")

    def rule(self, draft: Mapping[str, Any], index: int) -> tuple[dict[str, Any], str | None]:
        where = f"rule #{index + 1}"
        kind = draft.get("kind")
        out: dict[str, Any] = {}
        if kind == "required_when":
            field = self.field(draft.get("field"), where)
            out.update(kind=kind, field=field, when=self.condition(draft.get("when"), where))
            default_path = field
        elif kind == "compare":
            left_attr = (draft.get("left") or {}).get("field")
            left = self.field(left_attr, where)
            right_src = draft.get("right") or {}
            if "field" in right_src:
                right: dict[str, Any] = {"field": self.field(right_src["field"], where)}
            else:
                right = {"value": right_src.get("value")}
            ctype = draft.get("type") or _infer_type(
                self.info[left_attr], f"{self.name}: {where} (field {left_attr!r})"
            )
            if ctype not in ("number", "string", "date", "datetime"):
                raise ValidonceDefinitionError(f"{self.name}: {where}: bad compare type {ctype!r}")
            if "field" in right_src and not draft.get("type"):
                other = _infer_type(
                    self.info[right_src["field"]],
                    f"{self.name}: {where} (field {right_src['field']!r})",
                )
                if other != ctype:
                    raise ValidonceDefinitionError(
                        f"{self.name}: {where}: cannot compare {left_attr!r} ({ctype}) "
                        f"with {right_src['field']!r} ({other})"
                    )
            if "value" in right:
                self._check_value(right["value"], ctype, where)
            out.update(kind=kind, left={"field": left}, op=draft.get("op"), right=right, type=ctype)
            default_path = left
        elif kind in GROUP_KINDS:
            raw = draft.get("fields") or []
            if len(raw) < 2:
                raise ValidonceDefinitionError(
                    f"{self.name}: {where}: {kind} needs at least two fields"
                )
            if len(set(raw)) != len(raw):
                raise ValidonceDefinitionError(f"{self.name}: {where}: {kind} lists a field twice")
            wires = [self.field(a, where) for a in raw]
            out.update(kind=kind, fields=wires)
            default_path = wires[0]
        else:
            raise ValidonceDefinitionError(f"{self.name}: {where}: unknown rule kind {kind!r}")
        path = default_path
        if draft.get("path") is not None:
            path = self.field(draft["path"], where)
            out["path"] = path
        msg = draft.get("message")
        if not isinstance(msg, Mapping) or not isinstance(msg.get("key"), str) or not msg["key"]:
            raise ValidonceDefinitionError(f"{self.name}: {where}: message.key is required")
        message: dict[str, Any] = {"key": msg["key"]}
        if msg.get("params") is not None:
            for k, v in msg["params"].items():
                if not (v is None or isinstance(v, (str, int, float, bool))):
                    raise ValidonceDefinitionError(
                        f"{self.name}: {where}: param {k!r} must be a string, number, "
                        "boolean or null"
                    )
            message["params"] = dict(msg["params"])
        out["message"] = message
        if draft.get("server_only"):
            out["server_only"] = True
        rid = draft.get("id") or f"{self.name}.{kind}.{path}"
        out = {"id": rid, **out}
        return out, draft.get(_TEXT)

    def _check_value(self, value: Any, ctype: str, where: str) -> None:
        ok = (
            (ctype == "number" and isinstance(value, (int, float)) and not isinstance(value, bool))
            or (ctype == "string" and isinstance(value, str))
            or (ctype == "date" and _parse_date(value) is not None)
            or (ctype == "datetime" and _parse_datetime(value) is not None)
        )
        if not ok:
            raise ValidonceDefinitionError(
                f"{self.name}: {where}: value {value!r} does not match compare type {ctype}"
            )


class ValidonceModel(BaseModel):
    """A Pydantic model whose ``__rules__`` are enforced and exported."""

    __rules__: ClassVar[list[dict[str, Any]]] = []

    __validonce_rules__: ClassVar[list[dict[str, Any]]]
    __validonce_set__: ClassVar[RuleSet]
    __validonce_loc__: ClassVar[dict[str, str]]
    __validonce_meta__: ClassVar[dict[str, tuple[str, str | None]]]

    @classmethod
    def __pydantic_init_subclass__(cls, **kwargs: Any) -> None:
        super().__pydantic_init_subclass__(**kwargs)
        drafts: list[Mapping[str, Any]] = []
        for klass in reversed(cls.__mro__):
            if isinstance(klass, type) and issubclass(klass, ValidonceModel):
                drafts.extend(klass.__dict__.get("__rules__") or [])
        resolver = _Resolver(cls)
        rules: list[dict[str, Any]] = []
        meta: dict[str, tuple[str, str | None]] = {}
        for i, draft in enumerate(drafts):
            rule, text = resolver.rule(draft, i)
            if rule["id"] in meta:
                raise ValidonceDefinitionError(
                    f"{cls.__name__}: rule #{i + 1} has the same id {rule['id']!r} as an earlier "
                    "rule; pass id= to one of them"
                )
            meta[rule["id"]] = (rule["kind"], text)
            rules.append(rule)
        exported = {"version": FORMAT_VERSION, "rules": rules}
        cls.__validonce_rules__ = rules
        cls.__validonce_set__ = parse_rule_set(exported)  # also checks the format
        cls.__validonce_loc__ = resolver.loc
        cls.__validonce_meta__ = meta

    @classmethod
    def export_rules(cls) -> dict[str, Any]:
        """The rule set as a rule-format v1 dict (a copy)."""
        return {"version": FORMAT_VERSION, "rules": deepcopy(cls.__validonce_rules__)}

    @model_validator(mode="after")
    def _validonce_check(self) -> Any:
        cls = type(self)
        if not cls.__validonce_rules__:
            return self
        wire = self.model_dump(mode="json", by_alias=True)
        issues = evaluate(cls.__validonce_set__, wire, "server")
        if not issues:
            return self
        errors = []
        for issue in issues:
            kind, text = cls.__validonce_meta__[issue.rule_id]
            target = issue.path[0]
            ctx = {"ruleId": issue.rule_id, "key": issue.key, "params": dict(issue.params)}
            errors.append(
                {
                    "type": PydanticCustomError(f"validonce.{kind}", text or issue.key, ctx),
                    "loc": (cls.__validonce_loc__.get(target, target),),
                    "input": wire.get(target),
                }
            )
        raise ValidationError.from_exception_data(cls.__name__, errors)

    @classmethod
    def __get_pydantic_json_schema__(cls, core_schema: Any, handler: Any) -> dict[str, Any]:
        schema = handler(core_schema)
        if getattr(handler, "mode", "validation") == "validation" and cls.__validonce_rules__:
            target = handler.resolve_ref_schema(schema)
            target["x-validonce"] = cls.export_rules()
        return schema
