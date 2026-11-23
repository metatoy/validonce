# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Usage: python -I export_pydantic.py <project-dir> <module> <Class>. Prints the model's exported validonce rules as JSON."""
import importlib
import json
import sys

sys.path.insert(0, sys.argv[1])
cls = getattr(importlib.import_module(sys.argv[2]), sys.argv[3])
if not hasattr(cls, "export_rules"):
    print(json.dumps({"error": "model is not a ValidonceModel (no exported rules)"}))
else:
    print(json.dumps(cls.export_rules()))
