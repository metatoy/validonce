# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""FastAPI app enforcing the shared Signup rules (same contract as the ASP.NET example)."""

from datetime import date
from typing import Literal

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field
from validonce import F, ValidonceModel, all_or_none, at_least_one_of, when


class Signup(ValidonceModel):
    plan: Literal["free", "pro"]
    company: str | None = None
    email: str = Field(min_length=1)
    start: date
    end: date | None = None
    quantity: int

    __rules__ = [
        when(F.plan == "pro").require(
            F.company, key="rules.company_required", id="Signup.required_when.company"
        ),
        F.end.ge(F.start, key="rules.end_after_start", id="Signup.compare.end"),
        F.quantity.ge(1, key="rules.quantity_min", params={"min": 1}, id="Signup.compare.quantity"),
    ]


class Contact(ValidonceModel):
    # Field names are the wire names (see examples/CONTRACT.md).
    email: str | None = Field(default=None, json_schema_extra={"format": "email"})
    phone: str | None = Field(default=None, pattern=r"^\+?[0-9 ()-]{7,20}$")
    street: str | None = None
    city: str | None = None
    postalCode: str | None = None  # noqa: N815
    country: Literal["US", "CA", "GB", "other"]
    availableFrom: date | None = None  # noqa: N815
    availableTo: date | None = None  # noqa: N815

    # Order is part of the contract.
    __rules__ = [
        at_least_one_of(F.email, F.phone, key="rules.contact_email_or_phone"),
        all_or_none(F.street, F.city, F.postalCode, key="rules.address_all_or_none"),
        when(F.country == "US").require(F.postalCode, key="rules.postal_code_required_us"),
        F.availableTo.ge(F.availableFrom, key="rules.available_to_after_from"),
    ]


app = FastAPI(separate_input_output_schemas=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "https://playground.metatoy.com",
        "http://localhost:5180",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.post("/signups")
def create_signup(body: Signup) -> dict[str, bool]:
    return {"ok": True}


CONTACT_BODY_LIMIT = 16 * 1024


class ContactBodyLimit:
    """ASGI middleware: reject a POST /contacts body over 16 KB with 413.

    Checks Content-Length first, then counts the bytes actually received (chunked bodies).
    """

    def __init__(self, app, limit: int = CONTACT_BODY_LIMIT) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or scope["path"] != "/contacts":
            return await self.app(scope, receive, send)

        async def too_big() -> None:
            await JSONResponse({"detail": "Request body too large"}, status_code=413)(
                scope, receive, send
            )

        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.limit:
            return await too_big()

        chunks: list[bytes] = []
        size = 0
        more = True
        while more:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunks.append(message.get("body", b""))
            size += len(chunks[-1])
            if size > self.limit:
                return await too_big()
            more = message.get("more_body", False)
        body = b"".join(chunks)
        sent = False

        async def replay():
            nonlocal sent
            if sent:
                return await receive()
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)


app.add_middleware(ContactBodyLimit)


@app.post("/contacts")
def create_contact(body: Contact) -> dict[str, bool]:
    # Stateless: stores nothing and never logs the body.
    return {"ok": True}
