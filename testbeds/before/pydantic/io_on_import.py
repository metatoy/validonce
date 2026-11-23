# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Fixture that does I/O on import: the runner must refuse it with the clear message."""

import socket

from pydantic import BaseModel

socket.create_connection(("example.test", 80), timeout=1)


class Bad(BaseModel):
    x: int
