# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
"""Hand-written tokenizer, a faithful port of the C# PatternScanner.

The scanner works on a string of UTF-16 code units (see :func:`to_utf16`), so that
every offset matches the C# reference implementation.
"""

from __future__ import annotations

from dataclasses import dataclass

from .types import FINDING_BY_ID

SYNTAX_CHARS = "^$\\.*+?()[]{}|/"
_DIGITS = "0123456789"
_HEX = "0123456789abcdefABCDEF"


def to_utf16(s: str) -> str:
    """Return ``s`` re-expressed as UTF-16 code units (astral chars become surrogate pairs)."""
    if s.isascii():
        return s
    raw = s.encode("utf-16-le", "surrogatepass")
    return "".join(chr(int.from_bytes(raw[i : i + 2], "little")) for i in range(0, len(raw), 2))


def from_utf16(s: str) -> str:
    """Inverse of :func:`to_utf16` (unpaired surrogates become U+FFFD)."""
    if s.isascii():
        return s
    raw = b"".join(ord(c).to_bytes(2, "little") for c in s)
    return raw.decode("utf-16-le", "replace")


def _high(c: str) -> bool:
    return "\ud800" <= c <= "\udbff"


def _ascii_digit(c: str) -> bool:
    return c in _DIGITS


def _ascii_letter(c: str) -> bool:
    return c.isascii() and c.isalpha()


def _ascii_alnum(c: str) -> bool:
    return c.isascii() and c.isalnum()


@dataclass
class Hit:
    id: str
    start: int
    length: int
    rewrite: str | None = None


class ParseFailure(Exception):
    def __init__(self, position: int) -> None:
        super().__init__("parse failure")
        self.position = position


def _table_rewrite(fid: str) -> str | None:
    return FINDING_BY_ID[fid].rewrite


def _class_form(fid: str, in_class: bool) -> str | None:
    r = _table_rewrite(fid)
    if r is None or not in_class:
        return r
    return r[1:-1] if len(r) > 2 and r[0] == "[" and r[-1] == "]" else None


def _unicode_rewrite(hex_text: str) -> str | None:
    try:
        cp = int(hex_text, 16)
    except ValueError:
        return None
    if cp > 0xFFFF or 0xD800 <= cp <= 0xDFFF:
        return None
    return f"\\u{cp:04X}"


class _Scanner:
    def __init__(self, pattern: str) -> None:
        self.p = pattern
        self.n = len(pattern)
        self.hits: list[Hit] = []
        self.opener_hits: list[Hit] = []
        self.groups: list[int] = []
        self.can = False
        self.has_name_ref = False

    def add(self, fid: str, start: int, length: int, rewrite: str | None = None) -> None:
        self.hits.append(Hit(fid, start, length, rewrite))

    def top(self) -> None:
        p, n = self.p, self.n
        i = 0
        while i < n:
            c = p[i]
            if c == "\\":
                i, q, _ = self.escape(i, False)
                self.can = q
            elif c == "(":
                i = self.group(i)
            elif c == ")":
                if not self.groups:
                    raise ParseFailure(i)
                self.groups.pop()
                i += 1
                self.can = True
            elif c == "[":
                i = self.cls(i, False)
                self.can = True
            elif c == "]":
                self.add("VR025", i, 1, "\\]")
                i += 1
                self.can = True
            elif c in "*+?":
                if not self.can:
                    raise ParseFailure(i)
                i = self.after_quantifier(i + 1)
                self.can = False
            elif c == "{":
                brace = self.try_brace(i)
                if brace is not None:
                    end, no_min = brace
                    if not self.can:
                        raise ParseFailure(i)
                    if no_min:
                        self.add("VR018", i, end - i, "{0" + p[i + 1 : end])
                    i = self.after_quantifier(end)
                    self.can = False
                else:
                    self.add("VR025", i, 1, "\\{")
                    i += 1
                    self.can = True
            elif c == ".":
                self.add("VR014", i, 1, None)
                self.add("VR015", i, 1)
                i += 1
                self.can = True
            elif c == "^":
                i += 1
                self.can = False
            elif c == "$":
                self.add("VR005", i, 1)
                i += 1
                self.can = False
            elif c == "|":
                i += 1
                self.can = False
            else:
                i += 2 if _high(c) and i + 1 < n else 1
                self.can = True
        if self.groups:
            raise ParseFailure(self.groups[-1])

    def after_quantifier(self, i: int) -> int:
        p, n = self.p, self.n
        if i < n and p[i] == "?":
            return i + 1
        if i < n and p[i] == "+":
            self.add("VR012", i, 1, "")
            return i + 1
        return i

    def try_brace(self, i: int) -> tuple[int, bool] | None:
        p, n = self.p, self.n
        j = i + 1
        d1 = j
        while j < n and _ascii_digit(p[j]):
            j += 1
        has_min = j > d1
        comma = has_max = False
        if j < n and p[j] == ",":
            comma = True
            j += 1
            d2 = j
            while j < n and _ascii_digit(p[j]):
                j += 1
            has_max = j > d2
        if j >= n or p[j] != "}":
            return None
        if not has_min and not (comma and has_max):
            return None
        return j + 1, not has_min

    def parse_name(self, pos: int, terminator: str, fail_pos: int) -> int:
        p, n = self.p, self.n
        j = pos
        while j < n and (_ascii_alnum(p[j]) or p[j] == "_"):
            j += 1
        if j == pos or j >= n or p[j] != terminator:
            raise ParseFailure(fail_pos)
        return j

    def opener(self, s: int, length: int) -> None:
        h = Hit("VR011", s, length, "(")
        self.hits.append(h)
        self.opener_hits.append(h)
        self.groups.append(s)
        self.can = False

    def group(self, s: int) -> int:
        p, n = self.p, self.n
        i = s + 1
        if i >= n or p[i] != "?":
            self.groups.append(s)
            self.can = False
            return i
        if i + 1 >= n:
            raise ParseFailure(s)
        d = p[i + 1]
        if d == ":":
            self.groups.append(s)
            self.can = False
            return i + 2
        if d in "=!":
            self.add("VR009", s, 3)
            self.groups.append(s)
            self.can = False
            return i + 2
        if d == ">":
            self.add("VR012", s, 3, "(?:")
            self.groups.append(s)
            self.can = False
            return i + 2
        if d == "<":
            if i + 2 < n and p[i + 2] in "=!":
                self.add("VR008", s, 4)
                self.groups.append(s)
                self.can = False
                return i + 3
            e = self.parse_name(i + 2, ">", s)
            self.opener(s, e + 1 - s)
            return e + 1
        if d == "'":
            e = self.parse_name(i + 2, "'", s)
            self.opener(s, e + 1 - s)
            return e + 1
        if d == "P":
            if i + 2 < n and p[i + 2] == "<":
                e = self.parse_name(i + 3, ">", s)
                self.opener(s, e + 1 - s)
                return e + 1
            if i + 2 < n and p[i + 2] == "=":
                e = self.parse_name(i + 3, ")", s)
                self.add("VR011", s, e + 1 - s)
                self.has_name_ref = True
                self.can = True
                return e + 1
            raise ParseFailure(s)
        if d == "#":
            close = p.find(")", i)
            if close < 0:
                raise ParseFailure(s)
            return close + 1
        j = i + 1
        while j < n and p[j] in "imsxnuUaLJ-":
            j += 1
        if j == i + 1 or j >= n or (p[j] != ")" and p[j] != ":"):
            raise ParseFailure(s)
        flags = p[i + 1 : j]
        dash = flags.find("-")
        on = flags if dash < 0 else flags[:dash]
        self.add("VR013", s, j + 1 - s)
        if "i" in on:
            self.add("VR021", s, j + 1 - s)
        if p[j] == ":":
            self.groups.append(s)
        self.can = False
        return j + 1

    def hex_at(self, pos: int, count: int) -> bool:
        if pos + count > self.n:
            return False
        return all(self.p[pos + k] in _HEX for k in range(count))

    def escape(self, s: int, in_class: bool) -> tuple[int, bool, bool]:
        p, n = self.p, self.n
        quantifiable = True
        shorthand = False
        if s + 1 >= n:
            raise ParseFailure(s)
        c = p[s + 1]
        e = s + 2
        if c == "w":
            shorthand = True
            self.add("VR001", s, 2, _class_form("VR001", in_class))
        elif c == "d":
            shorthand = True
            self.add("VR002", s, 2, _class_form("VR002", in_class))
        elif c == "s":
            shorthand = True
            self.add("VR003", s, 2, _class_form("VR003", in_class))
        elif c == "W":
            shorthand = True
            self.add("VR001", s, 2)
        elif c == "D":
            shorthand = True
            self.add("VR002", s, 2)
        elif c == "S":
            shorthand = True
            self.add("VR003", s, 2)
        elif c in "bB":
            if not in_class:
                self.add("VR004", s, 2)
                quantifiable = False
        elif c == "A":
            self.add("VR007", s, 2, None if in_class else _table_rewrite("VR007"))
            quantifiable = False
        elif c in "Zz":
            self.add("VR006", s, 2, None if in_class else _table_rewrite("VR006"))
            quantifiable = False
        elif c == "0":
            pass
        elif c in "123456789":
            while e < n and _ascii_digit(p[e]):
                e += 1
            if not in_class:
                self.add("VR010", s, e - s)
        elif c in "xu":
            if e < n and p[e] == "{":
                close = p.find("}", e)
                if close < 0 or close == e + 1 or not self.hex_at(e + 1, close - e - 1):
                    raise ParseFailure(s)
                self.add("VR019", s, close + 1 - s, _unicode_rewrite(p[e + 1 : close]))
                e = close + 1
            elif self.hex_at(e, 2 if c == "x" else 4):
                e += 2 if c == "x" else 4
            else:
                raise ParseFailure(s)
        elif c == "U":
            if not self.hex_at(e, 8):
                raise ParseFailure(s)
            self.add("VR019", s, 10, _unicode_rewrite(p[e : e + 8]))
            e += 8
        elif c in "pP":
            if e < n and p[e] == "{":
                close = p.find("}", e)
                if close < 0 or close == e + 1:
                    raise ParseFailure(s)
                e = close + 1
            elif e < n and _ascii_letter(p[e]):
                e += 1
            else:
                raise ParseFailure(s)
            self.add("VR017", s, e - s)
        elif c == "k":
            if e < n and p[e] in "<'":
                close = self.parse_name(e + 1, ">" if p[e] == "<" else "'", s)
                e = close + 1
            else:
                raise ParseFailure(s)
            self.add("VR011", s, e - s)
            self.has_name_ref = True
        elif c == "c":
            if e < n and _ascii_letter(p[e]):
                e += 1
            else:
                raise ParseFailure(s)
        else:
            if ord(c) < 128:
                if not _ascii_alnum(c) and c not in SYNTAX_CHARS and not (in_class and c == "-"):
                    self.add("VR026", s, 2, c)
            elif _high(c) and e < n:
                e += 1
        return e, quantifiable, shorthand

    def cls(self, start: int, suppress_open: bool) -> int:
        p, n = self.p, self.n
        i = start + 1
        if i < n and p[i] == "^":
            i += 1
            if i < n and p[i] == "]":
                self.add("VR016", start, 3, _table_rewrite("VR016"))
                return i + 1
        elif i < n and p[i] == "]":
            i += 1

        prev_kind = prev_start = 0  # 1 atom, 2 shorthand
        suppress = suppress_open
        while True:
            if i >= n:
                raise ParseFailure(start)
            c = p[i]
            if c == "]":
                return i + 1
            if c == "[":
                if i + 1 < n and p[i + 1] == ":":
                    close = p.find(":]", i + 2)
                    if close > 0:
                        name = p[i + 2 : close]
                        neg = name.startswith("^")
                        if neg:
                            name = name[1:]
                        if name and all(_ascii_letter(ch) for ch in name):
                            rw = _class_form("VR023", True) if name == "alpha" and not neg else None
                            self.add("VR023", i, close + 2 - i, rw)
                            i = close + 2
                            prev_kind = 1
                            prev_start = i
                            suppress = False
                            continue
                if not suppress:
                    self.add("VR020", i, 1)
                suppress = False
                i = self.cls(i, False)
                prev_kind = 1
                prev_start = i
                continue
            if c == "-":
                if i + 1 < n and p[i + 1] == "[":
                    self.add("VR020", i, 2)
                    suppress = True
                    i += 1
                    prev_kind = 0
                    continue
                if i + 1 < n and p[i + 1] == "-":
                    self.add("VR020", i, 2)
                    i += 2
                    suppress = i < n and p[i] == "["
                    prev_kind = 0
                    continue
                has_next = i + 1 < n and p[i + 1] != "]"
                if has_next and prev_kind == 2:
                    self.add("VR022", prev_start, i + 1 - prev_start)
                elif (
                    has_next
                    and prev_kind == 1
                    and p[i + 1] == "\\"
                    and i + 2 < n
                    and p[i + 2] in "wdsWDS"
                ):
                    self.add("VR022", i, 3)
                prev_kind = 1
                prev_start = i
                i += 1
                continue
            if c == "&" and i + 1 < n and p[i + 1] == "&":
                self.add("VR020", i, 2)
                i += 2
                prev_kind = 0
                continue
            if c == "\\":
                s = i
                i, _, sh = self.escape(i, True)
                prev_kind = 2 if sh else 1
                prev_start = s
                continue
            prev_kind = 1
            prev_start = i
            i += 2 if _high(c) and i + 1 < n else 1


def scan(pattern: str) -> tuple[list[Hit], int | None]:
    """Scan a UTF-16 code unit string. Returns the hits and the parse failure offset, if any."""
    s = _Scanner(pattern)
    fail_at: int | None = None
    try:
        s.top()
    except ParseFailure as f:
        fail_at = f.position
    except Exception:  # noqa: BLE001 - mirrors the C# catch-all
        fail_at = 0
    if s.has_name_ref:
        for h in s.opener_hits:
            h.rewrite = None
    return s.hits, fail_at
