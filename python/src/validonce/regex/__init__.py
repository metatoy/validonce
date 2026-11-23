# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Regex portability linter: finds patterns that behave differently across regex engines."""

from .linter import PARSE_ERROR_ID, SAFE_REWRITE_IDS, lint, utf16_span_to_py
from .types import ENGINE_NAMES, FINDINGS, FindingInfo, PatternFinding

__all__ = [
    "ENGINE_NAMES",
    "FINDINGS",
    "PARSE_ERROR_ID",
    "SAFE_REWRITE_IDS",
    "FindingInfo",
    "PatternFinding",
    "lint",
    "utf16_span_to_py",
]
