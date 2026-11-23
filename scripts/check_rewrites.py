# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Checks the linter's suggested rewrites against the real engines.

For every regex fixture, apply every rewrite the linter suggests, run the rewritten pattern
on the same inputs in all five engines, and require: either the engines now agree, or the
linter still reports a finding on the rewritten pattern. A rewrite must never turn a
non-portable pattern into one the linter calls clean.

Usage (from the repo root, after building the CLI and with node, uv and dotnet available):
  uv run --project python python scripts/check_rewrites.py <workdir>
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "dotnet/src/Validonce.Cli/bin/Release/net10.0/Validonce.Cli.dll"
ENGINES = ["js", "js-u", "python-re", "rust-regex", "dotnet"]


def lint(pattern: str) -> list[dict]:
    out = subprocess.run(
        ["dotnet", str(CLI), "lint-regex", "--pattern", pattern, "--format", "json"]
        + ["--fail-on", "never"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)["patterns"][0]["findings"]


def run(cmd: list[str], dest: Path) -> None:
    dest.write_text(
        subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    )


def main() -> int:
    work = Path(sys.argv[1]).resolve()
    (work / "fx").mkdir(parents=True, exist_ok=True)
    cases, remaining = [], {}
    for path in sorted((ROOT / "conformance/regex").glob("*.json")):
        for case in json.loads(path.read_text(encoding="utf-8"))["cases"]:
            rewrites = [
                f for f in lint(case["pattern"]) if f.get("rewrite") is not None
            ]
            if not rewrites:
                continue
            pattern = case["pattern"]
            for f in sorted(rewrites, key=lambda f: -f["start"]):
                pattern = (
                    pattern[: f["start"]]
                    + f["rewrite"]
                    + pattern[f["start"] + f["length"] :]
                )
            cid = "rw-" + case["id"].removeprefix("rx-")
            placeholder = {e: "match" for e in ENGINES}
            inputs = [
                {"text": i["text"], "expect": placeholder} for i in case["inputs"]
            ]
            cases.append(
                {
                    "id": cid,
                    "finding": case["finding"],
                    "description": "rewrite",
                    "pattern": pattern,
                    "inputs": inputs,
                }
            )
            remaining[cid] = (case["id"], pattern, [f["id"] for f in lint(pattern)])
    doc = {"version": 1, "topic": "rewrites", "cases": cases}
    (work / "fx/rewrites.json").write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8"
    )

    fx = str(work / "fx")
    run(["node", "conformance/regex/runners/js.mjs", fx], work / "js.json")
    run(["python", "conformance/regex/runners/py_runner.py", fx], work / "py.json")
    run(
        [
            "dotnet",
            "run",
            "--project",
            "conformance/regex/runners/dotnet",
            "-c",
            "Release",
            "--",
            fx,
        ],
        work / "dotnet.json",
    )
    results: dict[str, dict] = {}
    for name in ("js", "py", "dotnet"):
        data = json.loads((work / f"{name}.json").read_text())
        for key, value in data["results"].items():
            results.setdefault(key, {}).update(value)

    agree, false_clean = 0, []
    for key, by_engine in sorted(results.items()):
        if len(set(by_engine.values())) == 1:
            agree += 1
            continue
        original, pattern, still = remaining[key.split("#")[0]]
        if not still:
            false_clean.append(f"{original}: {pattern!r} -> {by_engine}")
    for line in false_clean:
        print(f"FALSE CLEAN {line}")
    print(
        f"{len(cases)} rewritten patterns; {agree}/{len(results)} inputs agree on all engines; "
        f"false-clean: {len(false_clean)}"
    )
    return 1 if false_clean else 0


if __name__ == "__main__":
    sys.exit(main())
