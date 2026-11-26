# Pydantic (v2) to validonce

Target: `ValidonceModel` (a Pydantic `BaseModel`) with `__rules__` built from `F`, `when`, `at_least_one_of`, `exactly_one_of`, `all_or_none`. Run the old validator with `scripts/run-pydantic.py` in the project's own venv. Ground truth: `testbeds/before/pydantic/signup.py`.

Rules refer to fields by **attribute name** (`F.company`); the exporter turns them into wire names (alias, `serialization_alias`, `alias_generator`).

## Before to after, per kind

### required_when

```python
# before
@model_validator(mode="after")
def _rules(self):
    if self.plan == "pro" and not self.company:
        raise ValueError("Company is required")
    return self
```
```python
# after
class Signup(ValidonceModel):
    ...
    __rules__ = [
        when(F.plan == "pro").require(F.company, key="rules.company_required"),
    ]
```

Conditions: `F.plan != "free"`, `F.plan.is_in(["a", "b"])`, `F.phone.present()`, `F.phone.absent()`, `all_of(...)`, `any_of(...)`, `not_(...)`.

### compare

```python
# before
if self.end is not None and self.end < self.start:
    errs.append(...)
if self.quantity < 1:
    errs.append(...)
```
```python
# after
F.end.ge(F.start, key="rules.end_after_start"),
F.quantity.ge(1, key="rules.quantity_min", params={"min": 1}),
```

Methods: `lt le gt ge eq ne`. The compare type is inferred from the annotation (`int`/`float` number, `str` string, `date`, `AwareDatetime`); pass `type="datetime"` etc. to override. Note the inverted logic: the old code raises when `end < start`, the rule is `end >= start` (`ge`).

### Groups

```python
# before
if not (self.email or self.phone): ...
if (self.card is None) == (self.invoice is None): ...
# after
at_least_one_of(F.email, F.phone, key="rules.contact_required"),
exactly_one_of(F.card, F.invoice, key="rules.pay_one"),
all_or_none(F.street, F.city, F.zip, key="rules.address_all", path=F.street),
```

Options on every builder: `id=`, `server_only=True`, `path=F.other`, `params={...}`, `message="server text"`.

## Traps

- **`model_validator` has no field.** A `model_validator(mode="after")` that raises `ValueError` produces an error with an **empty `loc`** (`()`; Pydantic v1 called it `__root__`): the runner reports `__root__`, while validonce reports a field. That is a field-location warning, not a verdict difference. Where the old code builds errors with `loc=(field,)`, the field matches. Fix location differences with `path=`.
- **Raising one error vs several.** The old code may stop at the first `raise`; validonce reports every failing rule. Only accept/reject and the error field are compared; the count of issues is not.
- **Coercion.** Pydantic in lax mode turns `"5"` into `5` for an `int` before any validator runs. A `ValidonceModel` evaluates its rules on the **parsed** model dumped back to JSON (`model_dump(mode="json", by_alias=True)`), so on the Python server the rule sees `5`; the TypeScript client evaluates the raw input and sees `"5"`. The server-side differential check therefore agrees even for such inputs, but the browser may not: use `strict=True` or make the client send numbers. A rule comparing `str` with `int` is a coercing comparison: not migrated.
- **`bool` is an `int` in Python** (`True >= 1` is `True`). validonce never treats a boolean as a number, and `F.flag.ge(1, ...)` on a `bool` field is rejected when the class is defined. If the old code compares booleans numerically, keep it hand-written.
- **Falsy vs blank.** `not self.company` is true for `""` and `None`, but also for `0` and `False`. validonce blank is only missing, `null`, `""`, `[]`. For `str | None` fields the two agree; for numbers (`not self.quantity` is true for `0`) they do not.
- **`before` / `wrap` validators and `field_validator(..., info.data)`** read other fields: classify as `compare` or `required_when`, but `info.data` only holds fields **declared before** the validated one (the first field sees an empty dict). A rule that depends on a later field was silently skipping; the differential check will show it.
- **Aliases.** Rules use attribute names, the data uses aliases. `populate_by_name=True` accepts both on input; the wire is the alias. The runner feeds wire JSON.
- **Dates and datetimes.** `AwareDatetime` is required for `compare` type `datetime`; a naive `datetime` field has no offset and is rejected by the exporter.
- **Subclasses / inheritance**: `__rules__` of base classes run first, then the subclass's.
- **Runner**: import only the model module. If it imports the app, copy the class into a scratch file and say so in the report.
