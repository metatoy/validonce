# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

import pydantic

from validonce import FORMAT_VERSION


def test_format_version() -> None:
    assert FORMAT_VERSION == 1


def test_pydantic_is_v2() -> None:
    assert pydantic.VERSION.split(".")[0] == "2"
