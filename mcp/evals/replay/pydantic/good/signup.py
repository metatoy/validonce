# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Replay: the Signup cross-field rules migrated to ValidonceModel."""

from datetime import date
from typing import Literal

from pydantic import Field
from validonce.pydantic import F, ValidonceModel, when


class Signup(ValidonceModel):
    plan: Literal["free", "pro"]
    company: str | None = None
    email: str = Field(min_length=1)
    start: date
    end: date | None = None
    quantity: int

    __rules__ = [
        when(F.plan == "pro").require(F.company, key="rules.company_required"),
        F.end.ge(F.start, key="rules.end_after_start"),
        F.quantity.ge(1, key="rules.quantity_min", params={"min": 1}),
    ]
