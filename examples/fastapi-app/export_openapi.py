# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Write the app's OpenAPI document to a file (no server needed): python export_openapi.py OUT."""

import json
import sys

from app import app


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: export_openapi.py OUT.json")
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        json.dump(app.openapi(), f, indent=2, sort_keys=False, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
