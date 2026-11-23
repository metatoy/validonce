# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""'Before' fixture: the Signup rules as a hand-written Pydantic model (no validonce)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, model_validator
from pydantic_core import InitErrorDetails, PydanticCustomError


def _rule(field: str, message: str, value: object) -> InitErrorDetails:
    return InitErrorDetails(
        type=PydanticCustomError("rule", message, {"field": field}), loc=(), input=value
    )


class Signup(BaseModel):
    plan: Literal["free", "pro"]
    company: str | None = None
    email: str = Field(min_length=1)
    start: date
    end: date | None = None
    quantity: int

    @model_validator(mode="after")
    def _rules(self):
        errs = []
        if self.plan == "pro" and not self.company:
            errs.append(_rule("company", "Company is required", self.company))
        if self.end is not None and self.end < self.start:
            errs.append(_rule("end", "End must not be before start", self.end))
        if self.quantity < 1:
            errs.append(_rule("quantity", "Quantity must be at least 1", self.quantity))
        if errs:
            raise ValidationError.from_exception_data("Signup", errs)
        return self
