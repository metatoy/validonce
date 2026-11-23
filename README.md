<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/banner/readme-banner-dark.png">
    <img alt="validonce: write rules once, enforce them everywhere" src="assets/brand/banner/readme-banner-light.png" width="640">
  </picture>
</p>

# validonce

Write your validation rules once, on the server, and enforce the same rules in the browser.

> **Status: pre-release, private.** Nothing is published yet.

Field rules such as types, lengths and patterns already travel from a backend's OpenAPI document to the frontend. Rules that involve more than one field do not: "company is required when the plan is Pro", "the end date must be on or after the start date". Teams end up writing those twice, once in the backend and once in the form, and the two copies drift.

validonce lets you write them once, in your server's own validation library:

- **ASP.NET Core** with FluentValidation (first)
- **FastAPI** with Pydantic

The rules are exported as data inside your OpenAPI document. A small TypeScript runtime applies them to your Zod schemas, so React and Angular forms check the same rules before anything is sent, and show the error on the right field.

It also includes a **regex portability linter**, which flags `pattern` rules that behave differently in JavaScript, .NET, Python and Rust (the engine Pydantic uses).

## Layout

| Path | What |
|---|---|
| `spec/` | The rule format and design decisions |
| `conformance/` | Shared test cases every implementation must pass |
| `dotnet/` | C#: rule types, evaluator, FluentValidation and ASP.NET Core integration |
| `js/` | TypeScript: evaluator, Zod integration, form helpers |
| `python/` | Python: evaluator and Pydantic integration |

## Copyright and license

validonce is Copyright 2026 Metatoy LLC, licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE).

The validonce name and logo are not part of the code license; see [assets/brand/LICENSE](assets/brand/LICENSE).
