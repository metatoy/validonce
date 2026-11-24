# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

"""Booking request models."""

from datetime import datetime

from pydantic import BaseModel, model_validator


def _parse(value: str) -> datetime:
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m-%d-%Y"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    raise ValueError(f"unparseable date: {value}")


class Booking(BaseModel):
    expected_code: str | int
    entered_code: str | int
    check_in: str
    check_out: str

    @model_validator(mode="after")
    def _rules(self):
        if str(self.expected_code) != str(self.entered_code):
            raise ValueError("Codes must match")
        if _parse(self.check_out) < _parse(self.check_in):
            raise ValueError("Check-out must not be before check-in")
        return self
