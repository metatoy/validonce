# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Golden check, step 2 (Python): import every generated module and export its model's rules.

usage: python export.py GENERATED_DIR OUT.json
"""

import importlib.util
import json
import sys
from pathlib import Path

from validonce import ValidonceModel

gen, out = Path(sys.argv[1]), Path(sys.argv[2])
result = {}
for path in sorted(gen.glob("*.py")):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for name, obj in vars(mod).items():
        if isinstance(obj, type) and issubclass(obj, ValidonceModel) and obj is not ValidonceModel:
            result[name] = obj.export_rules()
out.write_text(json.dumps(result, indent=2), encoding="utf-8")
print(f"exported {len(result)} models")
