# Getting started: FastAPI

Write cross-field rules once on a Pydantic model. The server enforces them and FastAPI publishes them in OpenAPI. Needs Python 3.10+ and `pydantic>=2.9`.

## 1. Install

```sh
pip install validonce
```

## 2. Write the model

```python
from datetime import date
from typing import Literal

from fastapi import FastAPI
from pydantic import Field
from validonce import F, ValidonceModel, when


class Signup(ValidonceModel):
    plan: Literal["free", "pro"]
    company: str | None = None
    email: str = Field(min_length=1)
    start: date
    end: date | None = None
    quantity: int

    __rules__ = [
        when(F.plan == "pro").require(F.company, key="rules.company_required"),
        F.end.ge(F.start, key="rules.end_after_start"),
        F.quantity.ge(1, key="rules.quantity_min", params={"min": 1}),
    ]


app = FastAPI(separate_input_output_schemas=False)


@app.post("/signups")
def create_signup(body: Signup) -> dict[str, bool]:
    return {"ok": True}
```

Other builders: `at_least_one_of`, `exactly_one_of`, `all_or_none`, and the condition helpers `all_of`, `any_of`, `not_`. Every builder takes `key=`, `params=`, `id=`, `server_only=` and `message=`.

## 3. What you get

`/openapi.json` has the rules under `components.schemas.Signup["x-validonce"]`. `Signup.export_rules()` returns them as a dict.

A request that breaks a rule gets 422:

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

Rules run after field validation succeeds, so a request with a bad field type gets the normal Pydantic errors only. One `ValidationError` lists every failing rule. In the browser, `issuesFromFastApi` or `issuesFromResponse` from `validonce/server-errors` turns the body back into issues.

## Gotchas

- **`Signup-Input` and `Signup-Output`.** If a model is both a request body and a `response_model`, FastAPI splits it into two schemas and only `Signup-Input` has `x-validonce`. `rulesFromOpenApi(doc, "Signup")` finds `Signup-Input` for you. Or set `separate_input_output_schemas=False` to keep one `Signup`.
- **Naive `datetime`, `bool` and `Decimal` fields are rejected** by `compare` when the class is defined, because they would not compare the same on the wire. Use `AwareDatetime`, `int`/`float`, or pass `type=` for `str` fields that carry dates.
- **Rules see the wire form** (`model_dump(mode="json", by_alias=True)`). Field names in rules are aliases.
- Dates are ISO strings on the wire. Send `"2026-12-01"`, not a locale format.
- Ids default to `ClassName.kind.field`. Pass `id=` on a collision.
- Fewer than two fields, a repeated field or an unknown field in a group rule raises `ValidonceDefinitionError` at class definition, not at request time.

Next: the [React guide](client-react.md) or [Angular guide](client-angular.md). Runnable example: [examples/fastapi-app](../examples/fastapi-app/README.md).
