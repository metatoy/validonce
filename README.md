<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/banner/readme-banner-dark.png">
    <img alt="validonce: write rules once, enforce them everywhere. Rules written in ASP.NET Core or FastAPI travel through the OpenAPI document to React and Angular forms; Fastify, NestJS, Go, Spring, Vue and Web Components are planned." src="assets/brand/banner/readme-banner-light.png" width="830">
  </picture>
</p>

# validonce

Write cross-field validation rules once, on the server, and enforce the same rules in the browser.

Field rules such as types, lengths and patterns already travel from a backend's OpenAPI document to the frontend. Rules that involve more than one field do not: "company is required when the plan is Pro", "the end date must be on or after the start date". Teams write those twice, once in the backend and once in the form, and the two copies drift. validonce exports the rules from FluentValidation (C#) or Pydantic (Python) as data in your OpenAPI document, and a small TypeScript runtime applies them to your Zod schema, so React and Angular forms check the same rules and show each error on the right field.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/metatoy/validonce) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/metatoy/validonce/badge)](https://scorecard.dev/viewer/?uri=github.com/metatoy/validonce)

Try it without installing anything: the button opens a ready-to-run demo (ASP.NET backend and React form, with the shared rules enforced in the browser and on the server). It runs in a GitHub Codespace and uses your own free Codespaces hours.

<p align="center"><img alt="A sign-up form: the browser shows 'Company is required on the Pro plan'; with browser checks off, the server answers 422 and the same error appears under the same field" src="assets/demo/validonce-demo.gif" width="420"></p>

> **Status: v0.3.** Adds `validonce wrap` for orval and kubb output, a one-click Codespaces demo, and Zod date helpers. v0.2 added the rule-sharing core (ASP.NET Core, FastAPI, TypeScript with Zod, React and Angular); v0.1 was the regex linter.

## How it works

<p align="center"><img src="assets/diagram/how-it-works.png" alt="How validonce works. 1, server rules: FluentValidation (C#) with RequiredWhen and Compare, or Pydantic (Python) with __rules__. 2, the OpenAPI document: the rules travel as data under x-validonce on components.schemas, five rule kinds in one format. 3, the browser: the validonce runtime, withRules for Zod, with React (react-hook-form) and Angular (Signal and Reactive Forms). The server always enforces every request; a broken rule returns 422 with the same issue shape, mapped back onto each field." width="760"></p>

The server always enforces the rules. The browser runs them first to give fast feedback. If the browser is skipped or out of date, the server's 422 response uses the same issue shape, and the client maps it back onto the form fields.

## Features

- Five rule kinds: `required_when`, `compare`, `at_least_one_of`, `exactly_one_of`, `all_or_none`. See [the rule format](docs/rule-format-v1.md).
- C# (primary): FluentValidation validators, ASP.NET Core minimal APIs and MVC, OpenAPI export.
- Python: Pydantic models and FastAPI.
- TypeScript servers: Fastify (TypeBox) and NestJS, with `validonce/rules` builders.
- Go: struct rules with Huma and go-playground/validator.
- Java and Kotlin: Spring Boot with Bean Validation and springdoc (`com.metatoy:validonce-spring`).
- TypeScript client: Zod 4, react-hook-form helpers, Angular Signal Forms and Reactive Forms, server-error mapping.
- One shared conformance suite (125 cases) that every evaluator (C#, Python, TypeScript, Go, Java) passes.
- Regex portability linter for `pattern` rules.

## Install

```sh
dotnet add package Validonce.AspNetCore   # ASP.NET Core (brings Validonce.FluentValidation and Validonce)
pip install validonce                     # FastAPI / Pydantic (Python 3.10+, pydantic>=2.9)
go get github.com/metatoy/validonce/go    # Go / Huma (Go 1.26+)
pnpm add validonce zod                    # browser (npm install works too)
```

## Quick start

### ASP.NET Core

```csharp
using Validonce;
using Validonce.AspNetCore;
using Validonce.FluentValidation;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddValidonce();                                     // registers every ValidonceValidator<T>
builder.Services.AddOpenApi(o => o.AddValidonceSchemaTransformer()); // adds x-validonce to schemas
var app = builder.Build();
app.MapOpenApi();
app.MapPost("/signups", (Signup s) => Results.Ok()).WithValidonce(); // 422 on a broken rule
app.Run();

public sealed record Signup(string? Plan, string? Company, DateOnly? Start, DateOnly? End);

public sealed class SignupValidator : ValidonceValidator<Signup>
{
    public SignupValidator()
    {
        RequiredWhen(x => x.Company, If.Eq(x => x.Plan, "pro")).WithMessageKey("rules.company_required");
        Compare(x => x.End, CompareOp.Ge, x => x.Start).WithMessageKey("rules.end_after_start");
    }
}
```

More: [Getting started with ASP.NET Core](docs/getting-started-aspnet.md).

### FastAPI

```python
from datetime import date
from typing import Literal

from fastapi import FastAPI
from validonce import F, ValidonceModel, when


class Signup(ValidonceModel):
    plan: Literal["free", "pro"]
    company: str | None = None
    start: date
    end: date | None = None

    __rules__ = [
        when(F.plan == "pro").require(F.company, key="rules.company_required"),
        F.end.ge(F.start, key="rules.end_after_start"),
    ]


app = FastAPI(separate_input_output_schemas=False)


@app.post("/signups")
def create_signup(body: Signup): ...
```

More: [Getting started with FastAPI](docs/getting-started-fastapi.md).

### Browser

Read the rules from the OpenAPI document and attach them to a Zod schema (shared by both frameworks):

```ts
import { rulesFromOpenApi } from "validonce/openapi";
import { withRules } from "validonce/zod";
import { z } from "zod";

const doc = await (await fetch("/openapi.json")).json();
const rules = rulesFromOpenApi(doc, "Signup")!;
const schema = withRules(
  z.object({ plan: z.string(), company: z.string().nullable(), start: z.string(), end: z.string().nullable() }),
  rules,
  { messages: { "rules.company_required": "Company is required on the Pro plan" } },
);
```

React with react-hook-form:

```ts
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

const form = useForm({ resolver: zodResolver(schema) });
// form.formState.errors.company?.message
```

Angular Signal Forms:

```ts
import { form, validateStandardSchema } from "@angular/forms/signals";

const f = form(model, (path) => validateStandardSchema(path, schema));
```

More: [React guide](docs/client-react.md), [Angular guide](docs/client-angular.md).

## Docs

- [How it works](docs/how-it-works.md)
- [Getting started: ASP.NET Core](docs/getting-started-aspnet.md)
- [Getting started: FastAPI](docs/getting-started-fastapi.md)
- [Getting started: Fastify](docs/getting-started-fastify.md)
- [Getting started: NestJS](docs/getting-started-nestjs.md)
- [Getting started: Go](docs/getting-started-go.md)
- [Getting started: Spring Boot](docs/getting-started-spring.md)
- [Client: React](docs/client-react.md)
- [Client: Angular](docs/client-angular.md)
- [Client: plain HTML and web components](docs/client-dom.md)
- [Loading rules at runtime](docs/live-rules.md)
- [How validonce compares](docs/comparison.md)
- [Migrating an existing project with an agent](docs/agentic-migration.md)
- [Rule format v1](docs/rule-format-v1.md)
- [Regex findings](docs/regex-findings.md)
- Packages: [TypeScript](js/README.md), [Python](python/README.md), [.NET](dotnet/README.md)
- [Changelog](CHANGELOG.md)
- [Security policy](SECURITY.md)

## Regex portability linter

A `pattern` rule written on the server runs in more than one regex engine: JavaScript in the browser (through Zod), and .NET, Python `re` or Rust (Pydantic's default engine) on the server. The engines disagree more often than you would expect. `^\w+$` rejects `Café` in JavaScript and accepts it in the other three, and a lookbehind is a hard error in Pydantic.

The linter reports these differences, with a portable rewrite where one exists:

```sh
dotnet tool install -g Validonce.Cli
validonce lint-regex openapi.json            # every pattern in an OpenAPI or JSON Schema document
validonce lint-regex --pattern '^\w+$'       # a single pattern
```

It knows 25 findings across five engines (`js`, `js-u`, `python-re`, `rust-regex`, `dotnet`). Each one is backed by test cases that run on the real engines in CI, so the table cannot drift from what the engines actually do. See [docs/regex-findings.md](docs/regex-findings.md).

The tool reads an OpenAPI file, so it works for any backend language. The same checks are available as a library through the `Validonce` NuGet package (`Validonce.Patterns.PatternLinter`). The `validonce` Python package ships the same linter (`validonce lint-regex`, `validonce.regex.lint`).

## Layout

| Path | What |
|---|---|
| `docs/` | Guides, the rule format and the regex findings table |
| `conformance/` | Shared test cases every implementation must pass |
| `dotnet/` | C#: rule types, evaluator, FluentValidation and ASP.NET Core integration |
| `js/` | TypeScript: evaluator, Zod integration, form helpers |
| `java/` | Java and Kotlin: rule model, evaluator, builders and the Spring Boot integration (Gradle) |
| `python/` | Python: evaluator, Pydantic integration, regex linter |
| `examples/` | ASP.NET Core, FastAPI, Fastify, NestJS, Go and Spring Boot backends with the same rules, and the forms that read them |
| `assets/brand/` | Logo, icons and banners (not covered by the code license) |

## Copyright and license

validonce is Copyright 2026 Metatoy LLC, licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE).

The validonce name and logo are not part of the code license; see [assets/brand/LICENSE](assets/brand/LICENSE).
