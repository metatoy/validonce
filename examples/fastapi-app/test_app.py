# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
from fastapi.testclient import TestClient

from app import app

client = TestClient(app)
VALID = {"email": "a@example.com", "country": "CA"}


def issues(r):
    return {d["ctx"]["ruleId"]: d for d in r.json()["detail"] if d["type"].startswith("validonce")}


def test_valid_contact_is_200() -> None:
    r = client.post("/contacts", json=VALID)
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_each_rule_breaks_with_the_right_issue() -> None:
    cases = [
        ({"country": "CA"}, "Contact.at_least_one_of.email", "rules.contact_email_or_phone", "email"),
        (
            {**VALID, "street": "1 Main St"},
            "Contact.all_or_none.street",
            "rules.address_all_or_none",
            "street",
        ),
        (
            {**VALID, "country": "US"},
            "Contact.required_when.postalCode",
            "rules.postal_code_required_us",
            "postalCode",
        ),
        (
            {**VALID, "availableFrom": "2026-02-01", "availableTo": "2026-01-01"},
            "Contact.compare.availableTo",
            "rules.available_to_after_from",
            "availableTo",
        ),
    ]
    for body, rule_id, key, path in cases:
        r = client.post("/contacts", json=body)
        assert r.status_code == 422, rule_id
        d = issues(r)[rule_id]
        assert d["ctx"]["key"] == key
        assert d["loc"] == ["body", path]


def test_oversized_body_is_rejected() -> None:
    r = client.post("/contacts", json={**VALID, "street": "x" * 20_000})
    assert r.status_code == 413


def test_oversized_chunked_body_is_rejected() -> None:
    def gen():
        yield b'{"country":"CA","email":"a@b.co","street":"'
        yield b"x" * 20_000
        yield b'"}'

    r = client.post("/contacts", content=gen(), headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_chunked_small_body_still_works() -> None:
    def gen():
        yield b'{"country":"CA",'
        yield b'"email":"a@b.co"}'

    r = client.post("/contacts", content=gen(), headers={"content-type": "application/json"})
    assert r.status_code == 200
