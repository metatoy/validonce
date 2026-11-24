# How validonce compares

validonce covers one narrow job: **cross-field rules** (a field required when another has a value, one date after another, at least one of a group, and so on). They are written once on an ASP.NET Core or FastAPI server and enforced in Zod 4 clients from the OpenAPI document. Here is how that compares with the alternatives.

## Writing the rules twice

The usual approach: a FluentValidation or Pydantic rule on the server, and a hand-written Zod `refine`/`superRefine` (or an Angular group validator) on the client.

- **Works with no new dependency.** For one or two rules, this is fine.
- **The two copies drift.** Nothing checks that the client copy matches the server. Small differences are easy to miss: `>` against `>=`, whether `""` counts as missing, how dates compare. validonce pins these in [rule-format-v1.md](rule-format-v1.md) and checks every evaluator against the same [conformance cases](../conformance/rules/).
- **Changing a rule means changing two codebases.** With validonce, the client reads the rule from the server's OpenAPI document, so a server change reaches the client on the next build (or the next page load, see [live-rules.md](live-rules.md)).

## OpenAPI-to-Zod generators alone (orval, kubb)

[orval](https://github.com/orval-labs/orval) and [kubb](https://github.com/kubb-labs/kubb) (both MIT) generate Zod schemas from an OpenAPI document.

- **They carry field rules**: type, required, length, enum, `pattern`, because those are standard JSON Schema keywords.
- **They do not carry cross-field rules.** JSON Schema has no keyword for "required when another field equals X" or "end after start", so there is nothing in the document for a generator to translate.
- **validonce adds the missing part and works with them**: `validonce wrap` attaches the server's `x-validonce` rules to the schemas they generate. See [client-react.md](client-react.md).

## protovalidate

[protovalidate](https://github.com/bufbuild/protovalidate) (Apache-2.0, from Buf) is the mature project in this space, and the closest in idea: rules defined once, enforced in several languages.

- **It is much broader.** Rules are written as [CEL](https://cel.dev) expressions, so they can express arbitrary logic, including the cross-field rules validonce covers and many it cannot. It has implementations for Go, Java, Python, C++ and JS/TS (per its repository description).
- **Its source of truth is Protobuf.** Rules are annotations on `.proto` messages. If your API is described in Protobuf, use protovalidate.
- **validonce starts from where many web teams already are**: request models in ASP.NET Core or FastAPI, an OpenAPI document generated from them, and Zod forms. There is no schema language to adopt, and rules stay in FluentValidation or Pydantic.

## valbridge

[valbridge](https://github.com/vectorfy-co/valbridge) bridged Zod and Pydantic with conversion and code generation. Its repository was **archived** (read-only), with its last push on 2026-11-03. As we read it before archiving, it covered field rules and did not support custom (cross-field) validators.

## What validonce does not do

- **Arbitrary logic.** There are five rule kinds and no expression language. Arithmetic between fields (`a + b == total`), a format that depends on another field, and rules across nested objects stay hand-written. A rule marked `server_only` runs on the server and is skipped by clients.
- **Async or database checks** (uniqueness, "user exists"). These belong on the server only.
- **Field-level rules.** Type, length, enum and `pattern` travel as standard JSON Schema keywords; validonce only lints `pattern` regexes for portability.
- **Other stacks, for now.** Servers: ASP.NET Core, FastAPI, Fastify, NestJS, Go (Huma) and Spring Boot. Clients: Zod 4 (with react-hook-form, Angular Signal Forms or VeeValidate), Angular Reactive Forms, and plain HTML or web components.
- **Messages.** The rule carries a message key and parameters, not text. Your app maps keys to text.
