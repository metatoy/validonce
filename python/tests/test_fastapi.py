# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

from fastapi import FastAPI
from fastapi.testclient import TestClient

from .test_pydantic import BAD, Contact, Signup, Trip

app = FastAPI()


@app.post("/signup")
def signup(body: Signup) -> dict:
    return {"ok": True}


@app.post("/trip")
def trip(body: Trip) -> dict:
    return {"ok": True}


@app.post("/echo", response_model=Signup)
def echo(body: Signup) -> Signup:
    return body


@app.post("/contact")
def contact(body: Contact) -> dict:
    return {"ok": True}


client = TestClient(app)


def test_unknown_fastapi_422_keeps_location_and_ctx() -> None:
    r = client.post("/signup", json=BAD)
    assert r.status_code == 422
    detail = r.json()["detail"]
    hit = [d for d in detail if d["loc"] == ["body", "company"]]
    assert len(hit) == 1
    assert hit[0]["type"] == "validonce.required_when"
    assert hit[0]["ctx"] == {
        "ruleId": "Signup.required_when.company",
        "key": "rules.company_required",
        "params": {},
    }


def test_fastapi_valid_ok() -> None:
    r = client.post("/signup", json={"plan": "free", "start": "2026-01-01"})
    assert r.status_code == 200


def test_unknown_nested_model_location_fastapi() -> None:
    r = client.post(
        "/trip",
        json={
            "bookings": [
                {"start": "2026-01-01", "end": "2026-01-02"},
                {"start": "2026-02-01", "end": "2026-01-01"},
            ]
        },
    )
    assert r.status_code == 422
    (d,) = r.json()["detail"]
    assert d["loc"] == ["body", "bookings", 1, "end"]
    assert d["ctx"]["ruleId"] == "Booking.compare.end"


def _schemas(app: FastAPI) -> dict:
    return TestClient(app).get("/openapi.json").json()["components"]["schemas"]


def test_unknown_openapi_has_x_validonce() -> None:
    # Model used only as a request body: FastAPI names the schema plain "Signup".
    solo = FastAPI()

    @solo.post("/signup")
    def post_signup(body: Signup) -> dict:
        return {}

    assert _schemas(solo)["Signup"]["x-validonce"] == Signup.export_rules()


def test_openapi_split_input_output_schemas() -> None:
    # Also used as response_model: FastAPI splits Signup-Input / Signup-Output.
    # x-validonce is on the input (validation-mode) schema only.
    schemas = _schemas(app)
    assert schemas["Signup-Input"]["x-validonce"] == Signup.export_rules()
    assert "x-validonce" not in schemas["Signup-Output"]
    assert "Signup" not in schemas
    # Nested model carries its own rules.
    assert schemas["Booking"]["x-validonce"]["rules"][0]["id"] == "Booking.compare.end"

    merged = FastAPI(separate_input_output_schemas=False)

    @merged.post("/echo", response_model=Signup)
    def post_echo(body: Signup) -> Signup:
        return body

    assert _schemas(merged)["Signup"]["x-validonce"] == Signup.export_rules()


def test_group_rule_422_loc() -> None:
    r = client.post("/contact", json={})
    assert r.status_code == 422
    (d,) = r.json()["detail"]
    assert d["loc"] == ["body", "email"]
    assert d["type"] == "validonce.at_least_one_of"
    assert d["ctx"]["ruleId"] == "Contact.at_least_one_of.email"
    assert client.post("/contact", json={"phone": "+1 555 0100"}).status_code == 200
