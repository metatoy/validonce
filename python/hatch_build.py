# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Ship docs/regex-findings.json (the single source) inside the package.

From the repo the file is force-included from ../docs. An sdist carries it at its package
path, so a wheel built from that sdist finds it there and needs no force-include.
"""

from __future__ import annotations

from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

SOURCE = Path("..") / "docs" / "regex-findings.json"


class FindingsHook(BuildHookInterface):
    def initialize(self, version: str, build_data: dict) -> None:
        src = Path(self.root) / SOURCE
        if not src.is_file():
            return
        if self.target_name == "sdist":
            dest = "src/validonce/regex/regex-findings.json"
        else:
            dest = "validonce/regex/regex-findings.json"
        build_data["force_include"][str(src)] = dest
