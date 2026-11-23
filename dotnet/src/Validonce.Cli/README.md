# Validonce.Cli

`validonce` is a command-line tool that lints the regular expressions in an OpenAPI or JSON Schema document.
It finds patterns that match differently in JavaScript, Python, Rust and .NET, so a value does not pass on one side and fail on the other.

## Install

```
dotnet tool install -g Validonce.Cli
```

## Use

Lint every `pattern` in a document (use `-` to read standard input):

```
$ validonce lint-regex openapi.json
/components/schemas/Signup/properties/name/pattern
  ^\w+$
   ^^
  VR001 error  \w is ASCII-only in JavaScript but matches accented and CJK letters in Python, Rust and .NET. Found: \w
  suggested: [A-Za-z0-9_]
      ^
  VR005 warning A pattern ending in $ accepts "abc\n" in Python and .NET but rejects it in JavaScript and Rust, so a trailing newline passes on some servers only. Found: $

2 patterns, 2 findings (1 errors, 1 warnings)
```

Each pattern is reported with its JSON Pointer location. Lint a single pattern:

```
$ validonce lint-regex --pattern '[A-Za-z]+'
1 patterns, 0 findings (0 errors, 0 warnings)
```

Other commands: `validonce findings` lists every finding (id, severity, title); `validonce --version`; `validonce --help`.

### Options

| Option | Values | Default |
|---|---|---|
| `--engines` | comma-separated list of the engines below | all five |
| `--fail-on` | `error`, `warning`, `info`, `never` | `error` (warnings are printed but do not fail) |
| `--ignore` | comma-separated finding ids, e.g. `VR005,VR014` | none |
| `--format` | `text`, `json` | `text` |

Engines: `js` (no flags), `js-u` (the `u` flag), `python-re`, `rust-regex` (Pydantic's default), `dotnet`. All use search semantics.

`--format json` prints `{"version":1,"tool":"validonce","patterns":[{"location","pattern","findings":[{"id","severity","start","length","title","message","rewrite","engines"}]}],"summary":{...}}`.
Text output uses color only when stdout is a terminal and `NO_COLOR` is not set.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | No finding at or above `--fail-on`, after `--ignore` (also `--help` and `--version`) |
| 1 | At least one finding at or above `--fail-on` |
| 2 | Usage error, or the file is unreadable or not valid JSON (message on stderr); running with no arguments prints the usage and exits 2 |

## Findings

The full table of findings, with what differs in each engine and a portable rewrite, is at
https://github.com/metatoy/validonce/blob/main/docs/regex-findings.md

Copyright 2026 Metatoy LLC. Licensed under Apache-2.0.
