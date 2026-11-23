# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Regenerate regex_parity.json from the C# CLI (the reference implementation).

Run from the repo root after ``dotnet build dotnet/src/Validonce.Cli -c Release``:

    python python/tests/data/make_regex_parity.py
"""

from __future__ import annotations

import glob
import json
import random
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
DLL = REPO / "dotnet/src/Validonce.Cli/bin/Release/net10.0/Validonce.Cli.dll"
SEED = 20261122

CLEAN = [
    "^[A-Za-z0-9_]+", "^[0-9]{3}-[0-9]{4}", "^[a-z]+(?:-[a-z]+)*", "^[^@ ]+@[^@ ]+",
    "^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}", "abc", "^", "[A-F0-9]{8}", "a|b", "(?:ab)+c?",
    "^[a-z]{2,5}", "x*y+z?", "[^\\n\\r]+", "\\t\\n\\r", "^(?:abc|def)", "[a-z0-9-]+", "a{2}",
    "(ab)(cd)", "\\/\\*", "a{2,}?", "",
]  # fmt: skip

EXTRA = [
    "café\\w", "\U0001f600\\d", "\U0001f600.", "[\U0001f600-\U0001f64f]\\s", "\\u{1F600}",
    "\\x{41}", "\\U0001F600", "\\p{L}+", "(?P<n>a)(?P=n)", "(?<n>a)\\k<n>", "(?i)abc",
    "(?i:abc)", "[[:alpha:]]", "[\\w-z]", "[a-\\d]", "[a&&b]", "[a-[b]]", "a{,3}", "(?#c)x",
    "(?<=a)b", "(?<!a)b", "(?=a)b", "(a)\\1", "[]a]", "[^]a]", "\\", "(", ")", "[", "a**", "?a",
    "a{1", "\\A\\Z\\z", "(?>a)", "a++", "\\cJ", "\\q", "\\-", "[\\-]", "[\\q]", "\\.", "}", "]",
]  # fmt: skip

TOKENS = [
    "a", "b", "z", "0", "9", "-", "_", " ", ".", "*", "+", "?", "^", "$", "|", "(", ")", "[",
    "]", "{", "}", "{2}", "{,3}", "{1,}", "{2,5}", "\\", "\\w", "\\W", "\\d", "\\D", "\\s",
    "\\S", "\\b", "\\B", "\\A", "\\Z", "\\z", "\\1", "\\0", "\\x41", "\\x{41}", "\\u0041",
    "\\u{1F600}", "\\U0001F600", "\\p{L}", "\\P{N}", "\\pL", "\\k<n>", "\\cA", "\\n", "\\/",
    "\\q", "\\-", "(?:", "(?=", "(?!", "(?<=", "(?<!", "(?>", "(?<n>", "(?P<m>", "(?P=m)",
    "(?'q'", "(?i)", "(?i:", "(?-i)", "(?#x)", "[:alpha:]", "[^", "&&", "--", "é",
    "\U0001f600", "/",
]  # fmt: skip


def cs(*args: str) -> tuple[str, str, int]:
    proc = subprocess.run(["dotnet", str(DLL), *args], capture_output=True, check=False, timeout=60)
    return proc.stdout.decode("utf-8"), proc.stderr.decode("utf-8"), proc.returncode


def cs_pattern(pattern: str) -> list[dict]:
    out, err, code = cs(
        "lint-regex", f"--pattern={pattern}", "--format", "json", "--fail-on", "never"
    )
    if code != 0:
        raise SystemExit(f"C# failed for {pattern!r}: {code} {err}")
    return json.loads(out)["patterns"][0]["findings"]


def fuzz(count: int) -> list[str]:
    rng = random.Random(SEED)
    out: list[str] = []
    while len(out) < count:
        s = "".join(rng.choice(TOKENS) for _ in range(rng.randint(1, 9)))
        if s not in out:
            out.append(s)
    return out


def main() -> None:
    fixtures: list[str] = []
    for path in sorted(glob.glob(str(REPO / "conformance/regex/*.json"))):
        for case in json.load(open(path, encoding="utf-8"))["cases"]:
            fixtures.append(case["pattern"])
    patterns: list[str] = []
    for p in fixtures + CLEAN + EXTRA + fuzz(400):
        if p not in patterns:
            patterns.append(p)

    cases = [{"pattern": p, "findings": cs_pattern(p)} for p in patterns]

    sample = str(HERE / "openapi_sample.json")
    cli: dict[str, dict] = {}

    def record(name: str, *args: str) -> None:
        out, err, code = cs(*args)
        cli[name] = {"args": list(args), "stdout": out, "stderr": err, "exit": code}

    record("pattern_text", "lint-regex", "--pattern", "^\\w+$")
    record("pattern_json", "lint-regex", "--pattern", "^\\w+$", "--format", "json")
    record("pattern_clean_text", "lint-regex", "--pattern", "abc")
    record(
        "pattern_warning_fail_on_warning", "lint-regex", "--pattern", "a$", "--fail-on", "warning"
    )
    record("pattern_warning_default", "lint-regex", "--pattern", "a$")
    record("ignore", "lint-regex", "--pattern", "^\\w+$", "--ignore", "vr001,VR005")
    record("engines", "lint-regex", "--pattern", "(?<=a)b\\A", "--engines", "js,rust-regex")
    record("astral_json", "lint-regex", "--pattern", "\U0001f600\\w+", "--format", "json")
    record("astral_text", "lint-regex", "--pattern", "\U0001f600\\w+")
    record("openapi_text", "lint-regex", "SAMPLE")
    record("openapi_json", "lint-regex", "SAMPLE", "--format", "json", "--fail-on", "never")
    record(
        "openapi_ignore", "lint-regex", "SAMPLE", "--ignore", "VR001,VR002", "--fail-on", "warning"
    )
    record("findings", "findings")
    record("help", "--help")
    record("no_args")
    record("bad_option", "lint-regex", "--bogus")
    record("bad_engine", "lint-regex", "--pattern", "a", "--engines", "perl")
    record("both", "lint-regex", "x.json", "--pattern", "a")
    record("unknown_command", "nope")
    for entry in cli.values():  # recorded with the real path; stored with a placeholder
        entry["args"] = ["SAMPLE" if a == sample else a for a in entry["args"]]

    # Re-run the OpenAPI entries with the real path (record() above used the literal SAMPLE).
    for name, extra in (
        ("openapi_text", []),
        ("openapi_json", ["--format", "json", "--fail-on", "never"]),
        ("openapi_ignore", ["--ignore", "VR001,VR002", "--fail-on", "warning"]),
    ):
        out, err, code = cs("lint-regex", sample, *extra)
        cli[name].update(stdout=out, stderr=err, exit=code)

    doc = {"generator": "make_regex_parity.py", "seed": SEED, "cases": cases, "cli": cli}
    (HERE / "regex_parity.json").write_text(
        json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"{len(cases)} patterns, {len(cli)} cli captures", file=sys.stderr)


if __name__ == "__main__":
    main()
