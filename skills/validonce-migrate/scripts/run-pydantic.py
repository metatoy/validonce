# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""validonce-migrate runner: run a Pydantic model over wire-JSON inputs.

Usage (run from a scratch directory, with the user's consent):

    env -i PATH=/usr/bin:/bin <project venv>/bin/python -I run-pydantic.py \\
        <module_path.py> <ClassName> <inputs.jsonl> <out.jsonl>

* `env -i` scrubs the environment (no tokens, no DATABASE_URL). `-I` isolates Python
  from user site-packages, PYTHON* variables and the current directory.
* Network: `socket.socket` and `socket.create_connection` (and getaddrinfo) are
  replaced before the module is imported, so a module that opens a connection on
  import fails with "validonce runner: <module> needs I/O; isolate the schema module".
  This is a tripwire, not a sandbox. For a real one use `sandbox-exec -p
  '(version 1)(allow default)(deny network*)'` (macOS) or `unshare -n` (Linux).
* Import only the model module. If it pulls in the app (database, settings), copy the
  class into a scratch file instead and say so in the report.

Input line: wire JSON object. Output line, one per input:
    {"accept": bool, "paths": [top-level field names with errors], "error"?: str}

Where the path comes from, per Pydantic error, in order:
  1. `loc[0]` (field-level errors, including errors raised inside field validators);
  2. `ctx["field"]` (a PydanticCustomError raised from a model_validator with a
     context dict carrying "field");
  3. `ctx["error"].field` (a ValueError subclass with a `field` attribute);
  4. otherwise "__root__": a model-level error with no field. The agent must map it
     to a field (read the validator source) and re-run, or compare with warnings only;
     the accept/reject verdict is still exact.
An input that makes the validator raise something other than ValidationError is
reported with "error" and never counted as a rejection.
"""

import importlib.util
import json
import os
import socket
import sys

SOCKET_MSG = "needs I/O; isolate the schema module"


def _block_network(module_name: str) -> None:
    def _deny(*_a, **_k):
        raise RuntimeError(f"validonce runner: {module_name} {SOCKET_MSG}")

    class _DeniedSocket:
        def __init__(self, *_a, **_k):
            _deny()

    socket.socket = _DeniedSocket  # type: ignore[misc,assignment]
    socket.create_connection = _deny  # type: ignore[assignment]
    socket.getaddrinfo = _deny  # type: ignore[assignment]


def _paths(err) -> list[str]:
    out: list[str] = []
    for e in err.errors():
        loc = e.get("loc") or ()
        ctx = e.get("ctx") or {}
        if loc:
            p = str(loc[0])
        elif isinstance(ctx.get("field"), str):
            p = ctx["field"]
        elif isinstance(getattr(ctx.get("error"), "field", None), str):
            p = ctx["error"].field
        else:
            p = "__root__"
        if p not in out:
            out.append(p)
    return out


def main() -> int:
    if len(sys.argv) != 5:
        print("usage: run-pydantic.py <module_path> <ClassName> <inputs.jsonl> <out.jsonl>",
              file=sys.stderr)
        return 2
    module_path, class_name, inputs, out_path = sys.argv[1:]
    import pydantic

    flags = "-I" if sys.flags.isolated else "(not isolated: run with python -I)"
    env_note = "scrubbed" if not os.environ.get("HOME") else "NOT scrubbed (use env -i)"
    print(
        f"validonce-runner: run-pydantic python={sys.version.split()[0]} "
        f"pydantic={pydantic.VERSION} flags={flags} env={env_note} "
        "network=socket tripwire (use sandbox-exec/unshare -n for a real block)",
        file=sys.stderr,
    )
    _block_network(module_path)
    try:
        spec = importlib.util.spec_from_file_location("validonce_user_module", module_path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["validonce_user_module"] = mod
        spec.loader.exec_module(mod)
        cls = getattr(mod, class_name)
    except Exception as e:  # noqa: BLE001
        msg = str(e) if "validonce runner:" in str(e) else (
            f"validonce runner: cannot load {module_path}: {type(e).__name__}: {e}")
        print(msg, file=sys.stderr)
        return 3
    with open(inputs, encoding="utf-8") as fin, open(out_path, "w", encoding="utf-8") as fout:
        for line in fin:
            if not line.strip():
                continue
            data = json.loads(line)
            try:
                cls.model_validate(data)
                res = {"accept": True, "paths": []}
            except pydantic.ValidationError as e:
                res = {"accept": False, "paths": _paths(e)}
            except Exception as e:  # noqa: BLE001
                res = {"accept": False, "paths": [], "error": f"{type(e).__name__}: {e}"}
            fout.write(json.dumps(res) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
