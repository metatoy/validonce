# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
import re
from pathlib import Path

import validonce


def test_version_matches_pyproject():
    pyproject = (Path(__file__).parent.parent / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'^version = "([^"]+)"', pyproject, re.MULTILINE)
    assert match is not None
    assert validonce.__version__ == match.group(1)
