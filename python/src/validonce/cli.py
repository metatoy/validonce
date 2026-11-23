# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""``validonce`` command line: lint regular expressions for portability across regex engines.

Mirrors the C# ``Validonce.Cli`` tool: same options, output and exit codes.
"""

from __future__ import annotations

import json
import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, TextIO

from .regex import ENGINE_NAMES, FINDINGS, PatternFinding, lint
from .regex.scanner import from_utf16, to_utf16
from .regex.types import SEVERITY_RANK

USAGE = """\
validonce - lint regular expressions for portability across regex engines

Usage:
  validonce lint-regex <file.json | ->   lint every "pattern" in an OpenAPI / JSON Schema document
  validonce lint-regex --pattern <regex> lint one pattern
  validonce findings                      list the findings table
  validonce --version | --help

Options for lint-regex:
  --engines <list>    comma-separated: js, js-u, python-re, rust-regex, dotnet (default: all)
  --fail-on <level>   error | warning | info | never (default: error)
  --ignore <ids>      comma-separated finding ids to drop, e.g. VR005,VR014
  --format <format>   text | json (default: text)

Exit codes: 0 nothing at or above --fail-on (also --help, --version); 1 findings at or above it;
            2 usage error, unreadable or invalid JSON (no arguments prints this usage and exits 2)."""  # noqa: E501

# Keywords whose subtrees hold data, not schemas.
DATA_KEYWORDS = frozenset({"example", "examples", "default", "enum", "const"})


@dataclass
class _Located:
    location: str
    pattern: str
    findings: list[PatternFinding]


def _version() -> str:
    try:
        from importlib.metadata import version

        return version("validonce")
    except Exception:  # noqa: BLE001
        return "0.0.0"


def _usage_error(stderr: TextIO, message: str) -> int:
    stderr.write(f"validonce: {message}\n")
    stderr.write("Run 'validonce --help' for usage.\n")
    return 2


def _split(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def _strip_comments(text: str) -> str:
    """Drop // and /* */ comments outside strings (the C# tool skips JSON comments)."""
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            out.append(text[i : j + 1])
            i = j + 1
        elif text.startswith("//", i):
            while i < n and text[i] not in "\r\n":
                i += 1
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = n if end < 0 else end + 2
            out.append(" ")
        else:
            out.append(c)
            i += 1
    return "".join(out)


def _esc(segment: str) -> str:
    return segment.replace("~", "~0").replace("/", "~1")


def _walk(node: Any, pointer: str, engines: list[str] | None, results: list[_Located]) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            child = pointer + "/" + _esc(key)
            if key in DATA_KEYWORDS:
                continue
            if key == "pattern" and isinstance(value, str):
                results.append(_Located(child, value, lint(value, engines)))
            elif key == "patternProperties" and isinstance(value, dict):
                for pp_key, pp_value in value.items():
                    pp_pointer = child + "/" + _esc(pp_key)
                    results.append(_Located(pp_pointer, pp_key, lint(pp_key, engines)))
                    _walk(pp_value, pp_pointer, engines, results)
            else:
                _walk(value, child, engines, results)
    elif isinstance(node, list):
        for i, item in enumerate(node):
            _walk(item, f"{pointer}/{i}", engines, results)


def _display(pattern: str) -> tuple[str, list[int]]:
    """Show control characters as escapes; also the display column of each UTF-16 index."""
    parts: list[str] = []
    cols: list[int] = []
    width = 0
    for c in pattern:
        cols.append(width)
        if c == "\n":
            s = "\\n"
        elif c == "\r":
            s = "\\r"
        elif c == "\t":
            s = "\\t"
        elif c < " ":
            s = f"\\x{ord(c):02x}"
        else:
            s = c
        parts.append(s)
        width += len(s)
    cols.append(width)
    return "".join(parts), cols


def _sev_color(sev: str) -> str:
    return {"error": "31", "warning": "33"}.get(sev, "36")


def _write_text(
    o: TextIO, with_findings: list[_Located], total: int, findings: int, errors: int, warnings: int
) -> None:
    color = o is sys.stdout and o.isatty() and not os.environ.get("NO_COLOR")

    def paint(code: str, text: str) -> str:
        return f"\x1b[{code}m{text}\x1b[0m" if color else text

    def line(s: str) -> None:
        o.write(from_utf16(s) + "\n")

    for r in with_findings:
        line(paint("1", r.location if r.location else "(pattern)"))
        pat = to_utf16(r.pattern)
        shown, cols = _display(pat)
        line("  " + shown)
        for f in r.findings:
            start = min(max(f.start, 0), len(pat))
            end = min(max(f.start + max(f.length, 1), start), len(pat))
            frm = cols[start]
            width = max(cols[end] - frm, 1)
            line("  " + " " * frm + paint(_sev_color(f.severity), "^" * width))
            line(f"  {f.id} {paint(_sev_color(f.severity), f.severity.ljust(6))} {f.message}")
            if f.rewrite is not None:
                line(f"  suggested: {f.rewrite}")
        o.write("\n")
    o.write(f"{total} patterns, {findings} findings ({errors} errors, {warnings} warnings)\n")


_JSON_SHORT = {"\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b",
               "\f": "\\f"}  # fmt: skip


def _json_str(s: str) -> str:
    """Encode like System.Text.Json's default encoder (ASCII-safe, HTML-sensitive chars escaped)."""
    out = ['"']
    for ch in to_utf16(s):
        if ch in _JSON_SHORT:
            out.append(_JSON_SHORT[ch])
        elif " " <= ch <= "~" and ch not in "<>&'+\"":
            out.append(ch)
        else:
            out.append(f"\\u{ord(ch):04X}")
    out.append('"')
    return "".join(out)


def _dump(v: Any, indent: int = 0) -> str:
    pad = "  " * (indent + 1)
    end = "  " * indent
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return _json_str(v)
    if isinstance(v, list):
        if not v:
            return "[]"
        return "[\n" + ",\n".join(pad + _dump(x, indent + 1) for x in v) + "\n" + end + "]"
    if not v:
        return "{}"
    items = [f"{pad}{_json_str(k)}: {_dump(x, indent + 1)}" for k, x in v.items()]
    return "{\n" + ",\n".join(items) + "\n" + end + "}"


def _write_json(
    o: TextIO, results: list[_Located], findings: int, errors: int, warnings: int, infos: int
) -> None:
    patterns = [
        {
            "location": r.location,
            "pattern": r.pattern,
            "findings": [
                {
                    "id": f.id,
                    "severity": f.severity,
                    "start": f.start,
                    "length": f.length,
                    "title": f.title,
                    "message": f.message,
                    "rewrite": f.rewrite,
                    "engines": list(f.engines),
                }
                for f in r.findings
            ],
        }
        for r in results
    ]
    doc = {
        "version": 1,
        "tool": "validonce",
        "patterns": patterns,
        "summary": {
            "patterns": len(results),
            "findings": findings,
            "errors": errors,
            "warnings": warnings,
            "infos": infos,
        },
    }
    o.write(_dump(doc) + "\n")


def _lint_regex(args: list[str], stdout: TextIO, stderr: TextIO, stdin: TextIO) -> int:
    input_path: str | None = None
    single: str | None = None
    engines: list[str] = []
    fail_on = "error"
    ignore: set[str] = set()
    fmt = "text"

    i = 0
    while i < len(args):
        a = args[i]

        def is_opt(name: str, a: str = a) -> bool:
            return a == name or a.startswith(name + "=")

        def value(name: str, a: str = a) -> str | None:
            nonlocal i
            if a == name:
                if i + 1 >= len(args):
                    return None
                i += 1
                return args[i]
            return a[len(name) + 1 :]

        if is_opt("--pattern"):
            single = value("--pattern")
            if single is None:
                return _usage_error(stderr, "--pattern needs a value")
        elif is_opt("--engines"):
            v = value("--engines")
            if v is None:
                return _usage_error(stderr, "--engines needs a value")
            for part in _split(v):
                if part not in ENGINE_NAMES:
                    return _usage_error(
                        stderr,
                        f"unknown engine '{part}' "
                        "(expected js, js-u, python-re, rust-regex, dotnet)",
                    )
                if part not in engines:
                    engines.append(part)
            if not engines:
                return _usage_error(stderr, "--engines needs at least one engine")
        elif is_opt("--ignore"):
            v = value("--ignore")
            if v is None:
                return _usage_error(stderr, "--ignore needs a value")
            ignore.update(x.upper() for x in _split(v))
        elif is_opt("--fail-on"):
            v = value("--fail-on")
            if v not in ("error", "warning", "info", "never"):
                return _usage_error(stderr, "--fail-on must be error, warning, info or never")
            fail_on = v
        elif is_opt("--format"):
            v = value("--format")
            if v not in ("text", "json"):
                return _usage_error(stderr, "--format must be text or json")
            fmt = v
        elif a == "-" or not a.startswith("-"):
            if input_path is not None:
                return _usage_error(stderr, "only one input file is allowed")
            input_path = a
        else:
            return _usage_error(stderr, f"unknown option '{a}'")
        i += 1

    if single is not None and input_path is not None:
        return _usage_error(stderr, "give either a file or --pattern, not both")
    if single is None and input_path is None:
        return _usage_error(stderr, "lint-regex needs a file (or - for stdin) or --pattern <regex>")

    opts = None if len(engines) in (0, len(ENGINE_NAMES)) else engines
    results: list[_Located] = []

    if single is not None:
        results.append(_Located("", single, lint(single, opts)))
    else:
        try:
            if input_path == "-":
                text = stdin.read()
            else:
                with open(input_path, encoding="utf-8-sig") as fh:  # type: ignore[arg-type]
                    text = fh.read()
        except (OSError, ValueError) as e:
            stderr.write(f"validonce: cannot read '{input_path}': {e}\n")
            return 2
        try:
            root = json.loads(_strip_comments(text))
        except ValueError as e:
            stderr.write(f"validonce: invalid JSON in '{input_path}': {e}\n")
            return 2
        _walk(root, "", opts, results)

    if ignore:
        for r in results:
            r.findings = [f for f in r.findings if f.id.upper() not in ignore]

    finding_count = sum(len(r.findings) for r in results)
    errors = sum(1 for r in results for f in r.findings if f.severity == "error")
    warnings = sum(1 for r in results for f in r.findings if f.severity == "warning")
    infos = finding_count - errors - warnings

    if fmt == "json":
        _write_json(stdout, results, finding_count, errors, warnings, infos)
    else:
        _write_text(
            stdout,
            [r for r in results if r.findings],
            len(results),
            finding_count,
            errors,
            warnings,
        )

    if fail_on == "never":
        return 0
    threshold = SEVERITY_RANK[fail_on]
    return (
        1 if any(SEVERITY_RANK[f.severity] >= threshold for r in results for f in r.findings) else 0
    )


def run(
    args: Sequence[str],
    stdout: TextIO | None = None,
    stderr: TextIO | None = None,
    stdin: TextIO | None = None,
) -> int:
    """Run the CLI in-process and return the exit code."""
    out = stdout if stdout is not None else sys.stdout
    err = stderr if stderr is not None else sys.stderr
    argv = list(args)
    if not argv:
        out.write(USAGE + "\n")
        return 2
    cmd = argv[0]
    if cmd in ("--help", "-h", "help"):
        out.write(USAGE + "\n")
        return 0
    if cmd in ("--version", "-v"):
        out.write(_version() + "\n")
        return 0
    if cmd == "findings":
        if len(argv) > 1:
            return _usage_error(err, f"unexpected argument '{argv[1]}'")
        for f in FINDINGS:
            out.write(f"{f.id:<6} {f.severity:<8} {f.title}\n")
        return 0
    if cmd == "lint-regex":
        return _lint_regex(argv[1:], out, err, stdin if stdin is not None else sys.stdin)
    return _usage_error(err, f"unknown command '{cmd}'")


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except (AttributeError, ValueError):
            pass
    sys.exit(run(sys.argv[1:]))


if __name__ == "__main__":
    main()
