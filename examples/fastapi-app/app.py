# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""FastAPI app enforcing the shared Signup rules (same contract as the ASP.NET example)."""

from datetime import date
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field
from validonce import F, ValidonceModel, when


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


app = FastAPI(separate_input_output_schemas=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.post("/signups")
def create_signup(body: Signup) -> dict[str, bool]:
    return {"ok": True}
