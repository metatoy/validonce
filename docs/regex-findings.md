<!-- Generated from spec/regex-findings.json. Edit the JSON, then regenerate this table; the two must be kept in sync. -->

# Regex portability findings

Engines: js (`new RegExp(p)`), js-u (`u` flag), python-re, rust-regex (Pydantic default), dotnet. All use search semantics.

Expectations were measured with Node 22, Python 3.14, Pydantic 2.14 and .NET 11. Python-version-dependent cases: `\z` (3.14+), possessive quantifiers and atomic groups (3.11+), inline flags not at the start (error from 3.11). Scoped modifiers `(?i:...)` are left out because JavaScript support depends on the Node version.

| ID | Severity | Title | What differs | Portable rewrite | Cases |
|---|---|---|---|---|---|
| VR001 | error | \w matches non-ASCII letters in some engines | \w is ASCII-only in JavaScript but matches accented and CJK letters in Python, Rust and .NET. | `[A-Za-z0-9_]` | rx-001 |
| VR002 | error | \d matches non-ASCII digits in some engines | \d is 0-9 only in JavaScript but also matches Arabic-Indic and fullwidth digits in Python, Rust and .NET. | `[0-9]` | rx-002 |
| VR003 | warning | \s covers different white-space characters | The set of characters \s matches differs between engines: U+FEFF only in JavaScript, U+001C only in Python, U+0085 and U+00A0 not in every engine. | `[ \t\r\n\f\v]` | rx-003 |
| VR004 | warning | \b word boundary differs next to accented letters | Because \w differs, \b finds a boundary between "f" and "é" in JavaScript but not in Python, Rust or .NET. | `(?![A-Za-z0-9_]) or (?<![A-Za-z0-9_]) where lookarounds are allowed; otherwise avoid \b on non-ASCII text` | rx-004 |
| VR005 | error | $ matches before a final newline in Python and .NET | A pattern ending in $ accepts "abc\n" in Python and .NET but rejects it in JavaScript and Rust, so a trailing newline passes on some servers only. | `Reject newlines explicitly with a leading (?![\s\S]*\n) where lookahead is allowed, or validate the trimmed value` | rx-012 |
| VR006 | error | \Z and \z are not portable | \Z and \z are anchors in some engines, an identity escape in JavaScript, and an error in js-u and (for \Z) Rust. | `$ (see VR005 for newline behavior)` | rx-013, rx-014 |
| VR007 | error | \A is not portable | \A is the start of input in Python, Rust and .NET, an error in js-u, and only the letter A in plain JavaScript. | `^` | rx-015 |
| VR008 | error | Lookbehind support and width rules differ | Rust has no lookbehind; Python needs fixed width; JavaScript and .NET accept variable width. | none | rx-019, rx-020 |
| VR009 | error | Lookahead is rejected by Rust regex | Lookahead (?=...) and (?!...) work everywhere except Pydantic's default Rust engine, which refuses the pattern. | `Express the rule with several simpler patterns, or use Pydantic regex_engine="python-re"` | rx-021, rx-022 |
| VR010 | error | Backreferences are rejected by Rust regex | \1 works everywhere except Pydantic's default Rust engine. | none | rx-023 |
| VR011 | error | Named group syntax differs | (?P<n>...) is Python and Rust (also (?<n>...) in Rust); (?<n>...) is JavaScript and .NET; (?P=n) and \k<n> backreferences are not shared. | `Use a plain capturing group (...) when the name is not needed` | rx-024, rx-025, rx-026, rx-027 |
| VR012 | error | Possessive quantifiers and atomic groups are not portable | a++ is accepted by Python 3.11+ and (as a plain repeat) Rust, but not by JavaScript or .NET; (?>...) is accepted by Python 3.11+ and .NET only. | `Rewrite without them (plain greedy quantifier)` | rx-028, rx-029 |
| VR013 | error | Inline flags are not portable | (?i) at the start is an error in JavaScript; in the middle it is also an error in Python 3.11+. | `Spell out both cases in a class, e.g. [Aa][Bb][Cc]` | rx-030, rx-031 |
| VR014 | warning | . matches line terminators differently | . rejects \r and U+2028 in JavaScript but accepts them in Python, Rust and .NET; all reject \n. | `[^\n\r]` | rx-016 |
| VR015 | warning | . and characters outside the BMP | "😀" is one character to . in js-u, Python and Rust but two in plain JavaScript and .NET (UTF-16 surrogate pairs), so length rules like ^.{1,10}$ differ. | none | rx-017, rx-018 |
| VR016 | error | [^] is only valid in JavaScript | [^] means any character in JavaScript and is an error elsewhere. | `[\s\S]` | rx-005 |
| VR017 | error | \p{L} Unicode properties are not portable | \p{L} works in js-u, Rust and .NET, is a literal "p{L}" in plain JavaScript, and is an error in Python re. | none | rx-006 |
| VR018 | warning | {,3} quantifier is read differently | {,3} means 0 to 3 in Python, is literal text in JavaScript and .NET, and an error in js-u and Rust. | `{0,3}` | rx-034 |
| VR019 | error | Unicode escape forms differ | \x{...}, \U00000000 and \u{...} are each accepted by only some engines; \uXXXX is accepted by all. | `the literal character, or \uXXXX (surrogate pairs for non-BMP)` | rx-037, rx-038, rx-039, rx-040 |
| VR020 | error | Class subtraction and intersection syntax differ | [a-z-[aeiou]] is .NET, [[a-z]&&[^aeiou]] is Rust, and js-u rejects both (only the v flag adds set operations, and js-u is not v). | `[bcdfghjklmnpqrstvwxyz]` | rx-007, rx-008, rx-009 |
| VR021 | warning | Case-insensitive matching of special letters differs | With (?i), the Kelvin sign K matches k in Python, Rust and .NET; the long s matches s in Python and Rust but not .NET; JavaScript rejects (?i). | `[Kk], [Ss]` | rx-032, rx-033 |
| VR022 | error | Shorthand class as a range endpoint | [\w-.] works in JavaScript and .NET but is an error in js-u, Python and Rust. | `[\w.-] (put the hyphen last)` | rx-010 |
| VR023 | error | POSIX bracket classes [[:alpha:]] | [[:alpha:]] is a class only in Rust; elsewhere it is an ordinary class followed by stray characters (and js-u rejects it). | `[A-Za-z]` | rx-011 |
| VR025 | error | Literal { and ] are not portable | An unterminated {2 and a lone ] are accepted by most engines but rejected by js-u (and { by Rust). | `\{ and \]` | rx-035, rx-036 |
| VR026 | error | Unnecessary escapes are rejected by some engines | \@ \_ \- are identity escapes: fine in JavaScript, Python and Rust, errors in js-u (and \_ in .NET). | `drop the backslash (put - last in a class)` | rx-041, rx-042 |

## Per-engine behavior

### VR001 \w matches non-ASCII letters in some engines

- **js**: ASCII only [A-Za-z0-9_]
- **js-u**: ASCII only (the u flag does not widen \w)
- **python-re**: Unicode letters, digits, underscore
- **rust-regex**: Unicode letters, digits, underscore
- **dotnet**: Unicode letters, digits, underscore

### VR002 \d matches non-ASCII digits in some engines

- **js**: 0-9 only
- **js-u**: 0-9 only
- **python-re**: any Unicode decimal digit
- **rust-regex**: any Unicode decimal digit
- **dotnet**: any Unicode decimal digit

### VR003 \s covers different white-space characters

- **js**: includes U+00A0, U+FEFF, U+2003, U+2028; not U+0085
- **js-u**: same as js
- **python-re**: includes U+001C and U+0085; not U+FEFF
- **rust-regex**: Unicode White_Space: includes U+0085, not U+FEFF or U+001C
- **dotnet**: includes U+0085, U+00A0; not U+FEFF or U+001C

### VR004 \b word boundary differs next to accented letters

- **js**: ASCII word characters
- **js-u**: ASCII word characters
- **python-re**: Unicode word characters
- **rust-regex**: Unicode word characters
- **dotnet**: Unicode word characters

### VR005 $ matches before a final newline in Python and .NET

- **js**: $ is end of input only
- **js-u**: $ is end of input only
- **python-re**: $ also matches before a final \n
- **rust-regex**: $ is end of input only
- **dotnet**: $ also matches before a final \n

### VR006 \Z and \z are not portable

- **js**: identity escape: matches the letter Z or z
- **js-u**: error
- **python-re**: \Z is absolute end; \z accepted only from Python 3.14 (error before)
- **rust-regex**: \z is end of input; \Z is an error
- **dotnet**: \Z end or before final \n; \z absolute end

### VR007 \A is not portable

- **js**: identity escape: matches the letter A
- **js-u**: error
- **python-re**: start of input
- **rust-regex**: start of input
- **dotnet**: start of input

### VR008 Lookbehind support and width rules differ

- **js**: supported, variable width allowed
- **js-u**: supported, variable width allowed
- **python-re**: fixed width only
- **rust-regex**: not supported (error)
- **dotnet**: supported, variable width allowed

### VR009 Lookahead is rejected by Rust regex

- **js**: supported
- **js-u**: supported
- **python-re**: supported
- **rust-regex**: not supported (error)
- **dotnet**: supported

### VR010 Backreferences are rejected by Rust regex

- **js**: supported
- **js-u**: supported
- **python-re**: supported
- **rust-regex**: not supported (error)
- **dotnet**: supported

### VR011 Named group syntax differs

- **js**: (?<n>) and \k<n> only
- **js-u**: (?<n>) and \k<n> only
- **python-re**: (?P<n>) and (?P=n) only
- **rust-regex**: (?P<n>) and (?<n>); no backreferences
- **dotnet**: (?<n>) and \k<n>; (?P<n>) is an error

### VR012 Possessive quantifiers and atomic groups are not portable

- **js**: error
- **js-u**: error
- **python-re**: both supported (3.11+)
- **rust-regex**: a++ accepted (as a nested repeat, not possessive); (?>...) error
- **dotnet**: (?>...) supported; a++ error (nested quantifier)

### VR013 Inline flags are not portable

- **js**: error
- **js-u**: error
- **python-re**: only at the very start
- **rust-regex**: supported anywhere
- **dotnet**: supported anywhere

### VR014 . matches line terminators differently

- **js**: excludes \n \r U+2028 U+2029; U+0085 is matched
- **js-u**: excludes \n \r U+2028 U+2029; U+0085 is matched
- **python-re**: excludes \n only
- **rust-regex**: excludes \n only
- **dotnet**: excludes \n only

### VR015 . and characters outside the BMP

- **js**: two code units: ^.$ fails
- **js-u**: one code point
- **python-re**: one code point
- **rust-regex**: one code point
- **dotnet**: two UTF-16 units: ^.$ fails

### VR016 [^] is only valid in JavaScript

- **js**: matches any character
- **js-u**: matches any character
- **python-re**: error
- **rust-regex**: error
- **dotnet**: error

### VR017 \p{L} Unicode properties are not portable

- **js**: literal p{L}
- **js-u**: Unicode property
- **python-re**: error
- **rust-regex**: Unicode property
- **dotnet**: Unicode property

### VR018 {,3} quantifier is read differently

- **js**: literal text
- **js-u**: error
- **python-re**: 0 to 3 repeats
- **rust-regex**: error
- **dotnet**: literal text

### VR019 Unicode escape forms differ

- **js**: \uXXXX; \u{} only with u flag
- **js-u**: \uXXXX and \u{...}
- **python-re**: \uXXXX and \UXXXXXXXX
- **rust-regex**: \x{...}, \u{...}, \uXXXX, \UXXXXXXXX
- **dotnet**: \uXXXX only

### VR020 Class subtraction and intersection syntax differ

- **js**: literal characters, no set operations
- **js-u**: error
- **python-re**: literal characters, no set operations
- **rust-regex**: && intersection, -- difference, nested classes
- **dotnet**: subtraction with -[...] and --[...]; no && intersection

### VR021 Case-insensitive matching of special letters differs

- **js**: error
- **js-u**: error
- **python-re**: full Unicode case folding
- **rust-regex**: full Unicode case folding
- **dotnet**: Kelvin yes, long s no

### VR022 Shorthand class as a range endpoint

- **js**: hyphen is literal
- **js-u**: error
- **python-re**: error
- **rust-regex**: error
- **dotnet**: hyphen is literal

### VR023 POSIX bracket classes [[:alpha:]]

- **js**: nested set read as [[:alph] then literal
- **js-u**: error
- **python-re**: same as js
- **rust-regex**: letters
- **dotnet**: same as js

### VR025 Literal { and ] are not portable

- **js**: literal
- **js-u**: error
- **python-re**: literal
- **rust-regex**: { error; ] literal
- **dotnet**: literal

### VR026 Unnecessary escapes are rejected by some engines

- **js**: accepted
- **js-u**: only syntax characters may be escaped
- **python-re**: accepted
- **rust-regex**: accepted
- **dotnet**: \_ is an error

