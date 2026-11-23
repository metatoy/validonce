# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

"""Tricky fixture: a format that depends on another field (US postal codes are 5 digits, UK ones are not).

validonce has no pattern rule and no format-by-condition, so the agent must keep this.
"""

import re

from pydantic import BaseModel, model_validator

_FORMATS = {"US": r"^\d{5}(-\d{4})?$", "GB": r"^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$"}


class Address(BaseModel):
    country: str
    postal_code: str

    @model_validator(mode="after")
    def _rules(self):
        pattern = _FORMATS.get(self.country)
        if pattern and not re.match(pattern, self.postal_code):
            raise ValueError("Postal code does not match the country's format")
        return self
