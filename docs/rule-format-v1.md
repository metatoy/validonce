# validonce rule format, version 1

Status: draft for Part 1 (2026-11-22). Changes to this file change the contract every implementation is tested against, so each change also updates `conformance/`.

## Purpose

A server writes its cross-field validation rules once, in its own validation library (FluentValidation in C#, Pydantic in Python). validonce exports those rules as data in this format. Every evaluator — C#, TypeScript, Python — reads the same data and must reach the same result for the same input. The shared cases in `conformance/rules/` are the proof.

Field-level rules (type, length, enum, `pattern`) are not part of this format. They already travel through standard JSON Schema keywords.

## Where the data lives

On each object schema in an OpenAPI document (or a plain JSON Schema), under the key `x-validonce`:

```json
{
  "type": "object",
  "properties": { "plan": { "type": "string" }, "company": { "type": ["string", "null"] } },
  "x-validonce": {
    "version": 1,
    "rules": [
      {
        "id": "Signup.required_when.company",
        "kind": "required_when",
        "field": "company",
        "when": { "eq": { "field": "plan", "value": "pro" } },
        "message": { "key": "rules.company_required" }
      }
    ]
  }
}
```

The machine-readable schema for this object is `conformance/schema/rule-format-v1.schema.json`.

## Common rule fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique within the model. Exporters derive `Model.kind.path` when the author gives none, and fail on a collision |
| `kind` | yes | One of the five kinds below |
| `path` | no | The field the error is reported on. Defaults per kind (below) |
| `message` | yes | `{ "key": string, "params"?: object }`. Params values are strings, numbers, booleans or null |
| `server_only` | no | `true` means clients skip the rule. The server always evaluates it |

All field names are **wire names**: the names in the JSON body, after aliases and naming policies are applied.

A v1 rule refers only to fields of the object it is attached to. A nested object carries its own rules; its issues are reported with the path prefix of where it sits (`["items", "3", "end"]`). Prefixing is the host's job, not the evaluator's.

## Rule kinds

| Kind | Fields | Fails when | Default `path` |
|---|---|---|---|
| `required_when` | `field`, `when` (condition) | `when` is true and `field` is blank | `field` |
| `compare` | `left` (`{ "field" }`), `op`, `right` (`{ "field" }` or `{ "value" }`), `type` | both sides pass the type check and the comparison is false | `left.field` |
| `at_least_one_of` | `fields` (2 or more) | every listed field is blank | first of `fields` |
| `exactly_one_of` | `fields` (2 or more) | the number of non-blank fields is not exactly one | first of `fields` |
| `all_or_none` | `fields` (2 or more) | some, but not all, listed fields are blank | first of `fields` |

`op` is one of `lt`, `le`, `gt`, `ge`, `eq`, `ne`. `type` is one of `number`, `string`, `date`, `datetime`.

`compare` **passes** when either side is blank, and when either side fails its type check. Requiredness is always a separate rule. An exporter rejects a `compare` whose `type` does not match the JSON Schema type of its fields, so a type failure at runtime means the data is wrong, and field-level validation reports it.

## Conditions (used by `required_when`)

Each condition is an object with exactly one key.

| Condition | Shape | True when |
|---|---|---|
| `eq` | `{ "eq": { "field", "value" } }` | the field's value strictly equals `value` |
| `ne` | `{ "ne": { "field", "value" } }` | `eq` would be false (so a blank field makes `ne` true) |
| `in` | `{ "in": { "field", "values": [...] } }` | `eq` is true for at least one of `values` |
| `present` | `{ "present": { "field" } }` | the field is not blank |
| `absent` | `{ "absent": { "field" } }` | the field is blank |
| `all` | `{ "all": [conditions] }` (1 or more) | every condition is true |
| `any` | `{ "any": [conditions] }` (1 or more) | at least one condition is true |
| `not` | `{ "not": condition }` | the condition is false |

`value` and the items of `values` are strings, numbers or booleans. `null` is not allowed; use `absent`.

## Pinned behavior

These rules exist because languages disagree by default. Every evaluator follows them exactly.

1. **Evaluate the wire form.** The evaluator receives the JSON value of the object, as it is or would be sent over the wire: C# evaluates the serialized JSON, Python evaluates `model_dump(mode="json", by_alias=True)`, TypeScript evaluates the parsed JSON (or the Zod-parsed output, which is the same shape).
2. **Blank** means: the key is missing, the value is `null`, the value is `""`, or the value is `[]`. Nothing else is blank: `" "`, `0`, `false` and `{}` are not blank.
3. **No type coercion.** `"1"` is not `1`. `"true"` is not `true`. A boolean is never a number (Python's `bool` is a subclass of `int`; implementations must check for it).
4. **Strict equality** (`eq`, `ne`, `in`, and `compare` with `eq`/`ne`): same JSON type and same value. Numbers compare numerically (`1` equals `1.0`). Strings compare exactly, code point by code point, with no Unicode normalization and no case folding. An array or object value is never equal to anything, so `eq` on it is false.
5. **Numbers** are compared as IEEE 754 double-precision values.
6. **Strings** in `compare` with `lt`/`le`/`gt`/`ge` are ordered by Unicode code point, not by UTF-16 code unit. (JavaScript's `<` and C#'s ordinal comparison use UTF-16 code units and disagree with code-point order for characters above U+FFFF; implementations must compensate.)
7. **`date`** is a string `YYYY-MM-DD` naming a real calendar date, years 0001–9999. Anything else fails the type check. Year `0000` is outside this range even though ISO 8601 and some libraries allow it (Zod's `z.iso.date()` accepts `0000-01-01`), so a `compare` of type `date` passes when either side is `0000-…`.
8. **`datetime`** is a string `YYYY-MM-DDTHH:MM:SS[.fraction](Z|±HH:MM)`, with an uppercase `T` and `Z`, a real date, hours 00–23, minutes and seconds 00–59, and an offset whose hours are 00–23 and minutes 00–59. A value with no offset fails the type check. Values compare as instants in time, at **millisecond precision**: fraction digits after the third are ignored.
9. **Order and count of issues.** Rules are evaluated in array order. Each failing rule yields exactly one issue. Issues are returned in rule order.
10. **A field that is not in the data** is blank. Rules may assume the rule data itself has been validated against the schema.

## Issues

Every failing rule produces one issue, in the same shape everywhere — client evaluation, server responses after mapping, and the conformance cases:

```json
{ "path": ["company"], "ruleId": "Signup.required_when.company", "key": "rules.company_required", "params": {} }
```

- `path`: the rule's `path` (or its default), as a one-element array at the evaluator; hosts add prefixes for nested objects.
- `params`: exactly the rule's `message.params`, or `{}` when it has none. Evaluators add nothing.

Server responses carry the same list: FastAPI's 422 body through each error's `ctx`, and ASP.NET through a ProblemDetails extension `validonce`. The JavaScript `server-errors` adapters turn either back into this list.

## Conformance cases

`conformance/rules/*.json` files follow `conformance/schema/case.schema.json`:

```json
{
  "version": 1,
  "suite": "required_when",
  "cases": [
    { "id": "rw-001", "description": "...", "rules": [ ... ], "data": { ... }, "expect": [ ... ] }
  ]
}
```

`expect` is the server-side result: every rule evaluated. The client-side result is `expect` with the issues of `server_only` rules removed. Every runner checks both.

## Versioning

`version` is the format version. A change that could alter the result for any valid input is a new version. Adding a rule kind or condition is a new version too, because an old evaluator cannot run it; evaluators reject versions they do not know rather than skipping rules silently.
