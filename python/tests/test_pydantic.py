# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal

import pytest
from jsonschema import Draft202012Validator
from pydantic import AwareDatetime, ConfigDict, Field, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from validonce import (
    F,
    ValidonceDefinitionError,
    ValidonceModel,
    all_of,
    all_or_none,
    at_least_one_of,
    evaluate,
    exactly_one_of,
    not_,
    parse_rule_set,
    when,
)

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "conformance" / "schema"


class Signup(ValidonceModel):
    plan: Literal["free", "pro"]
    company: str | None = None
    start: date
    end: date | None = None
    quantity: int = 1

    __rules__ = [
        when(F.plan == "pro").require(F.company, key="rules.company_required"),
        F.end.ge(F.start, key="rules.end_after_start"),
        F.quantity.ge(1, key="rules.qty_min", params={"min": 1}),
    ]


class Booking(ValidonceModel):
    start: date
    end: date | None = None
    __rules__ = [F.end.ge(F.start, key="rules.end_after_start")]


class Trip(ValidonceModel):
    bookings: list[Booking]


class Aliased(ValidonceModel):
    plan: str
    company_name: str | None = Field(None, alias="companyName")
    __rules__ = [when(F.plan == "pro").require(F.company_name, key="k")]


class Extra(Signup):
    model_config = ConfigDict(json_schema_extra={"examples": [{"plan": "free"}]})
    __rules__ = [F.quantity.le(10, key="rules.qty_max", id="Extra.qty_max")]


BAD = {"plan": "pro", "start": "2026-02-01", "end": "2026-01-01", "quantity": 0}


def test_unknown_error_lands_on_field() -> None:
    with pytest.raises(ValidationError) as exc:
        Signup.model_validate(BAD)
    errs = {e["ctx"]["ruleId"]: e for e in exc.value.errors()}
    e = errs["Signup.required_when.company"]
    assert e["loc"] == ("company",)
    assert e["type"] == "validonce.required_when"
    assert e["msg"] == "rules.company_required"
    assert e["ctx"] == {
        "ruleId": "Signup.required_when.company",
        "key": "rules.company_required",
        "params": {},
    }
    assert errs["Signup.compare.quantity"]["ctx"]["params"] == {"min": 1}
    assert len(errs) == 3  # one ValidationError lists every issue


def test_valid_passes() -> None:
    s = Signup(plan="free", start=date(2026, 1, 1), end=date(2026, 1, 2))
    assert s.quantity == 1


def test_message_text_override() -> None:
    class M(ValidonceModel):
        a: int | None = None
        __rules__ = [F.a.ge(1, key="k", message="a too small")]

    with pytest.raises(ValidationError) as exc:
        M(a=0)
    assert exc.value.errors()[0]["msg"] == "a too small"
    assert "_text" not in json.dumps(M.export_rules())


def test_unknown_nested_model_location() -> None:
    with pytest.raises(ValidationError) as exc:
        Trip.model_validate(
            {
                "bookings": [
                    {"start": "2026-01-01", "end": "2026-01-02"},
                    {"start": "2026-02-01", "end": "2026-01-01"},
                ]
            }
        )
    (e,) = exc.value.errors()
    assert e["loc"] == ("bookings", 1, "end")
    assert e["ctx"]["ruleId"] == "Booking.compare.end"


def test_unknown_subclass_json_schema_extra() -> None:
    schema = Extra.model_json_schema()
    assert schema["examples"] == [{"plan": "free"}]
    assert schema["x-validonce"] == Extra.export_rules()
    ids = [r["id"] for r in schema["x-validonce"]["rules"]]
    assert ids == [
        "Extra.required_when.company",
        "Extra.compare.end",
        "Extra.compare.quantity",
        "Extra.qty_max",
    ]


def test_subclass_enforces_parent_and_own_rules() -> None:
    with pytest.raises(ValidationError) as exc:
        Extra.model_validate({**BAD, "quantity": 11})
    rule_ids = {e["ctx"]["ruleId"] for e in exc.value.errors()}
    assert "Extra.required_when.company" in rule_ids
    assert "Extra.qty_max" in rule_ids


def test_exported_rules_match_schema() -> None:
    docs = [json.loads(p.read_text()) for p in sorted(SCHEMA_PATH.glob("*.schema.json"))]
    registry = Registry().with_resources(
        (d["$id"], Resource.from_contents(d, default_specification=DRAFT202012))
        for d in docs
        if "$id" in d
    )
    schema = json.loads((SCHEMA_PATH / "rule-format-v1.schema.json").read_text())
    validator = Draft202012Validator(schema, registry=registry)
    for model in (Signup, Booking, Aliased, Extra):
        errors = list(validator.iter_errors(model.export_rules()))
        assert not errors, [e.message for e in errors]


def test_model_issues_equal_evaluator() -> None:
    with pytest.raises(ValidationError) as exc:
        Signup.model_validate(BAD)
    wire = Signup.model_construct(
        plan="pro", company=None, start=date(2026, 2, 1), end=date(2026, 1, 1), quantity=0
    ).model_dump(mode="json", by_alias=True)
    expected = evaluate(parse_rule_set(Signup.export_rules()), wire)
    got = [(e["loc"][0], e["ctx"]["ruleId"], e["ctx"]["key"]) for e in exc.value.errors()]
    assert got == [(i.path[0], i.rule_id, i.key) for i in expected]


def test_aliases_use_wire_names() -> None:
    (rule,) = Aliased.export_rules()["rules"]
    assert rule["field"] == "companyName"
    assert rule["id"] == "Aliased.required_when.companyName"
    with pytest.raises(ValidationError) as exc:
        Aliased.model_validate({"plan": "pro"})
    assert exc.value.errors()[0]["loc"] == ("companyName",)


def test_condition_builders() -> None:
    class C(ValidonceModel):
        a: str | None = None
        b: str | None = None
        c: str | None = None
        __rules__ = [
            when(all_of(F.a.is_in(["x", "y"]), not_(F.b.present()), F.c.absent())).require(
                F.c, key="k1", server_only=True
            ),
            when(F.a != "x").require(F.b, key="k2", id="C.custom", path=F.a),
        ]

    rules = C.export_rules()["rules"]
    assert rules[0]["when"] == {
        "all": [
            {"in": {"field": "a", "values": ["x", "y"]}},
            {"not": {"present": {"field": "b"}}},
            {"absent": {"field": "c"}},
        ]
    }
    assert rules[0]["server_only"] is True
    assert rules[1]["id"] == "C.custom" and rules[1]["path"] == "a"
    with pytest.raises(ValidationError):
        C(a="x")


def test_definition_unknown_field() -> None:
    with pytest.raises(ValidonceDefinitionError, match="unknown field 'nope'"):

        class A(ValidonceModel):
            a: int = 0
            __rules__ = [F.nope.ge(1, key="k")]


def test_definition_bool_compare() -> None:
    with pytest.raises(ValidonceDefinitionError, match="bool is not a number"):

        class B(ValidonceModel):
            flag: bool = False
            __rules__ = [F.flag.ge(1, key="k")]


def test_definition_naive_datetime() -> None:
    with pytest.raises(ValidonceDefinitionError, match="timezone-aware"):

        class N(ValidonceModel):
            a: datetime
            b: datetime
            __rules__ = [F.b.ge(F.a, key="k")]


def test_aware_datetime_supported() -> None:
    class Aw(ValidonceModel):
        a: AwareDatetime
        b: AwareDatetime
        __rules__ = [F.b.ge(F.a, key="k")]

    assert Aw.export_rules()["rules"][0]["type"] == "datetime"
    with pytest.raises(ValidationError):
        Aw(a="2026-01-02T00:00:00Z", b="2026-01-01T00:00:00+00:00")
    Aw(a="2026-01-01T00:00:00Z", b="2026-01-01T02:00:00+02:00")


def test_definition_decimal_rejected() -> None:
    with pytest.raises(ValidonceDefinitionError, match="Decimal"):

        class D(ValidonceModel):
            a: Decimal = Decimal(1)
            __rules__ = [F.a.ge(1, key="k")]


def test_definition_id_collision_and_override() -> None:
    with pytest.raises(ValidonceDefinitionError, match="same id"):

        class Dup(ValidonceModel):
            n: int = 0
            __rules__ = [F.n.ge(1, key="a"), F.n.le(5, key="b")]

    class Ok(ValidonceModel):
        n: int = 0
        __rules__ = [F.n.ge(1, key="a"), F.n.le(5, key="b", id="Ok.max")]

    assert [r["id"] for r in Ok.export_rules()["rules"]] == ["Ok.compare.n", "Ok.max"]


def test_definition_type_mismatch_and_bad_value() -> None:
    with pytest.raises(ValidonceDefinitionError, match="cannot compare"):

        class T(ValidonceModel):
            a: int = 0
            b: str = ""
            __rules__ = [F.a.ge(F.b, key="k")]

    with pytest.raises(ValidonceDefinitionError, match="does not match"):

        class V(ValidonceModel):
            a: int = 0
            __rules__ = [F.a.ge("x", key="k")]


def test_no_rules_model_has_no_extension() -> None:
    class Plain(ValidonceModel):
        a: int = 0

    assert "x-validonce" not in Plain.model_json_schema()
    assert Plain.export_rules() == {"version": 1, "rules": []}


class Contact(ValidonceModel):
    email: str | None = None
    phone: str | None = None
    __rules__ = [at_least_one_of(F.email, F.phone, key="rules.contact_required")]


class Payment(ValidonceModel):
    card: str | None = None
    invoice: str | None = None
    __rules__ = [
        exactly_one_of(F.card, F.invoice, key="rules.one_payment", path=F.invoice, id="Pay.one")
    ]


class Address(ValidonceModel):
    street: str | None = Field(None, alias="streetLine")
    city: str | None = None
    postcode: str | None = None
    __rules__ = [
        all_or_none(F.street, F.city, F.postcode, key="rules.address_complete", server_only=True)
    ]


def test_group_export_and_schema() -> None:
    assert Contact.export_rules()["rules"] == [
        {
            "id": "Contact.at_least_one_of.email",
            "kind": "at_least_one_of",
            "fields": ["email", "phone"],
            "message": {"key": "rules.contact_required"},
        }
    ]
    (pay,) = Payment.export_rules()["rules"]
    assert pay["id"] == "Pay.one" and pay["path"] == "invoice"
    (addr,) = Address.export_rules()["rules"]
    assert addr["fields"] == ["streetLine", "city", "postcode"]
    assert addr["id"] == "Address.all_or_none.streetLine"
    assert addr["server_only"] is True
    docs = [json.loads(p.read_text()) for p in sorted(SCHEMA_PATH.glob("*.schema.json"))]
    registry = Registry().with_resources(
        (d["$id"], Resource.from_contents(d, default_specification=DRAFT202012))
        for d in docs
        if "$id" in d
    )
    schema = json.loads((SCHEMA_PATH / "rule-format-v1.schema.json").read_text())
    validator = Draft202012Validator(schema, registry=registry)
    for model in (Contact, Payment, Address):
        errors = list(validator.iter_errors(model.export_rules()))
        assert not errors, [e.message for e in errors]


def test_group_errors_land_on_first_field_or_path() -> None:
    with pytest.raises(ValidationError) as exc:
        Contact()
    (e,) = exc.value.errors()
    assert e["loc"] == ("email",)
    assert e["type"] == "validonce.at_least_one_of"
    assert e["ctx"]["key"] == "rules.contact_required"
    Contact(phone="+1 555 0100")

    with pytest.raises(ValidationError) as exc:
        Payment(card="c", invoice="i")
    assert exc.value.errors()[0]["loc"] == ("invoice",)
    with pytest.raises(ValidationError):
        Payment()
    Payment(card="c")

    with pytest.raises(ValidationError) as exc:
        Address.model_validate({"streetLine": "1 Main St"})
    assert exc.value.errors()[0]["loc"] == ("streetLine",)
    Address.model_validate({})


def test_group_definition_errors() -> None:
    with pytest.raises(ValidonceDefinitionError, match="at least two"):

        class One(ValidonceModel):
            a: str | None = None
            __rules__ = [at_least_one_of(F.a, key="k")]

    with pytest.raises(ValidonceDefinitionError, match="twice"):

        class Dup(ValidonceModel):
            a: str | None = None
            __rules__ = [exactly_one_of(F.a, F.a, key="k")]

    with pytest.raises(ValidonceDefinitionError, match="unknown field"):

        class Unknown(ValidonceModel):
            a: str | None = None
            __rules__ = [all_or_none(F.a, F.nope, key="k")]
