# Example contracts

Every example backend (`aspnet-app`, `fastapi-app`, `fastify-app`, `nestjs-app`, `go-app`,
`spring-app`) implements the same contracts, written once in each language. Their OpenAPI exports
in `conformance/golden/` must carry **identical** `x-validonce` for each contract (as JSON values,
rule order included). `scripts/check_golden.py` checks this in CI.

## Signup (`POST /signups`)

The original contract: see any backend's example.

## Contact (`POST /contacts`), used by the playground

Fields (wire names):

| Field | Type | Field rules (standard JSON Schema; not compared by the golden check) |
|---|---|---|
| `email` | string, optional, nullable | email format |
| `phone` | string, optional, nullable | pattern `^\+?[0-9 ()-]{7,20}$` |
| `street` | string, optional, nullable | |
| `city` | string, optional, nullable | |
| `postalCode` | string, optional, nullable | |
| `country` | string, required | enum `US`, `CA`, `GB`, `other` |
| `availableFrom` | date (`YYYY-MM-DD`), optional, nullable | |
| `availableTo` | date (`YYYY-MM-DD`), optional, nullable | |

`x-validonce` on the `Contact` schema, exactly (rule order included):

```json
{
  "version": 1,
  "rules": [
    { "id": "Contact.at_least_one_of.email", "kind": "at_least_one_of", "fields": ["email", "phone"],
      "message": { "key": "rules.contact_email_or_phone" } },
    { "id": "Contact.all_or_none.street", "kind": "all_or_none", "fields": ["street", "city", "postalCode"],
      "message": { "key": "rules.address_all_or_none" } },
    { "id": "Contact.required_when.postalCode", "kind": "required_when", "field": "postalCode",
      "when": { "eq": { "field": "country", "value": "US" } },
      "message": { "key": "rules.postal_code_required_us" } },
    { "id": "Contact.compare.availableTo", "kind": "compare", "left": { "field": "availableTo" },
      "op": "ge", "right": { "field": "availableFrom" }, "type": "date",
      "message": { "key": "rules.available_to_after_from" } }
  ]
}
```

The ids are each exporter's default (`Model.kind.path`). The issue paths are `email`, `street`,
`postalCode` and `availableTo` (each rule's default path).

Messages (the frontends' catalog):

| Key | English |
|---|---|
| `rules.contact_email_or_phone` | Enter an email or a phone number |
| `rules.address_all_or_none` | Fill in street, city and postal code together |
| `rules.postal_code_required_us` | Postal code is required in the US |
| `rules.available_to_after_from` | Available to must be on or after available from |

**Server behaviour.** The endpoint is stateless: it stores nothing, never logs request bodies,
rejects bodies over 16 KB, and returns 200 `{ "ok": true }` for a valid contact. Field errors use
the framework's normal response; rule errors use the shared 422 (see "Transport" in
`docs/rule-format-v1.md`).

**Known regex difference.** The regex linter reports VR005 for the phone pattern: `$` also matches
before a final newline in Python and .NET. No anchor is portable to all five engines. A form field
can't produce a trailing newline, and the browser (JavaScript) is the stricter side, so this is
accepted.
