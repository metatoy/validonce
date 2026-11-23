# validonce (Python)

Write cross-field validation rules once on a Pydantic model. validonce enforces them on the
server and exports them as data (`x-validonce`) for other evaluators (browser, .NET).

```
pip install validonce      # needs Python 3.10+ and pydantic>=2.9
```

## Define a model

```python
from datetime import date
from typing import Literal

from validonce import ValidonceModel, F, when


class Signup(ValidonceModel):
    plan: Literal["free", "pro"]
    company: str | None = None
    start: date
    end: date | None = None
    quantity: int = 1

    __rules__ = [
        when(F.plan == "pro").require(F.company, key="rules.company_required"),
        F.end.ge(F.start, key="rules.end_after_start"),
        F.quantity.ge(1, key="rules.qty_min", params={"min": 1}),
    ]
```

- Rules run after field validation succeeds, on the wire form
  (`model_dump(mode="json", by_alias=True)`). One `ValidationError` lists every failing rule.
- Each error sits on its target field, with `type="validonce.<kind>"`, `msg` = the key
  (or `message="..."` if given) and `ctx={"ruleId", "key", "params"}`.
- `Signup.export_rules()` returns the rule-format v1 dict. Field names are wire names
  (aliases applied); ids default to `ClassName.kind.field` (pass `id=` on a collision).
- `compare` types come from the annotation: `int`/`float` → number, `str` → string,
  `date` → date, `AwareDatetime` → datetime. Naive `datetime`, `bool` and `Decimal` fields are
  rejected when the class is defined (they would not compare on the wire); pass `type=` to
  override for `str` fields that carry dates.

## Group rules

Three builders take two or more fields. A field is blank when it is missing, `None`, `""` or `[]`.

```python
from validonce import F, ValidonceModel, all_or_none, at_least_one_of, exactly_one_of


class Checkout(ValidonceModel):
    email: str | None = None
    phone: str | None = None
    card: str | None = None
    invoice: str | None = None
    street: str | None = None
    city: str | None = None
    postcode: str | None = None

    __rules__ = [
        at_least_one_of(F.email, F.phone, key="rules.contact_required"),
        exactly_one_of(F.card, F.invoice, key="rules.one_payment"),
        all_or_none(F.street, F.city, F.postcode, key="rules.address_complete"),
    ]
```

- `at_least_one_of` fails when every field is blank; `exactly_one_of` fails unless exactly one
  is non-blank; `all_or_none` fails when some, but not all, are blank.
- The error lands on the first field unless `path=F.other` is given. The default id is
  `ClassName.kind.first_wire_field`. `params=`, `id=`, `server_only=` and `message=` work as
  on the other builders.
- Fewer than two fields, a repeated field or an unknown field raises
  `ValidonceDefinitionError` when the class is defined.

## FastAPI

```python
app = FastAPI()


@app.post("/signup")
def signup(body: Signup): ...
```

A failing request returns 422:

```json
{"detail": [{
  "type": "validonce.required_when",
  "loc": ["body", "company"],
  "msg": "rules.company_required",
  "input": null,
  "ctx": {"ruleId": "Signup.required_when.company",
          "key": "rules.company_required", "params": {}}
}]}
```

Nested models report their own location, e.g. `["body", "bookings", 1, "end"]`.

`/openapi.json` carries the rules under `components.schemas.Signup["x-validonce"]`. If the model
is also a `response_model`, FastAPI splits it into `Signup-Input` (has `x-validonce`) and
`Signup-Output` (none); set `separate_input_output_schemas=False` to keep a single `Signup`.

## Regex linter

`validonce` ships a regex portability linter: it finds patterns whose meaning differs between
JavaScript, Python `re`, Rust `regex` and .NET (for example `\w`, `\d`, `$`, `\Z`, lookbehind,
named groups). It is a port of the released C# tool and gives the same findings, spans and
rewrites. The findings table lives in `docs/regex-findings.json` and is bundled in the wheel.

## Command line

```sh
validonce lint-regex --pattern '^\w+$'
validonce lint-regex openapi.json                 # every "pattern" / patternProperties key
cat schema.json | validonce lint-regex - --format json
validonce lint-regex openapi.json --engines js,python-re --ignore VR005 --fail-on warning
validonce findings                                # list the findings table
```

Options: `--engines` (`js`, `js-u`, `python-re`, `rust-regex`, `dotnet`; default all),
`--fail-on error|warning|info|never` (default `error`), `--ignore VR005,VR014`,
`--format text|json`. Exit codes: `0` nothing at or above `--fail-on`, `1` findings at or above it,
`2` usage error or unreadable / invalid JSON. Subtrees under `example`, `examples`, `default`,
`enum` and `const` are skipped.

## Python API

```python
from validonce.regex import lint, utf16_span_to_py

for f in lint(r"^\w+$", engines=["js", "python-re"]):
    print(f.id, f.severity, f.rewrite)
    s, e = utf16_span_to_py(r"^\w+$", f.start, f.length)
```

`lint(pattern, engines=None)` returns `PatternFinding(id, severity, start, length, title, message,
rewrite, engines)` sorted by position. It never raises on pattern content: an unparseable
pattern gives a `VR000` finding. `start` and `length` are **UTF-16 code unit offsets** (the same as
the C# tool and JavaScript); for patterns without characters above U+FFFF they equal Python string
indexes, otherwise convert with `utf16_span_to_py`. `SAFE_REWRITE_IDS` lists the findings whose
`rewrite` is a drop-in replacement; `FINDINGS` is the whole table.
