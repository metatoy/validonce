# validonce docs

The project overview, install and quick starts are in the [repository README](../README.md).

## Server

- [Getting started: ASP.NET Core](getting-started-aspnet.md): a `ValidonceValidator<T>`
- [Getting started: FastAPI](getting-started-fastapi.md): a `ValidonceModel`
- [Getting started: Fastify](getting-started-fastify.md): `defineRules` and a TypeBox schema
- [Getting started: NestJS](getting-started-nestjs.md): `@ValidonceRules` on a DTO
- [Getting started: Go](getting-started-go.md): `validonce.MustBuild` with Huma or go-playground/validator
- [Getting started: Spring Boot](getting-started-spring.md): a `RuleDefinition<T>` for Java and Kotlin
- [Kubernetes custom resources](kubernetes.md): translate CEL `x-kubernetes-validations` to rules

## Client

- [React](client-react.md): react-hook-form and Zod
- [Angular](client-angular.md): Signal Forms and Reactive Forms
- [Vue](client-vue.md): VeeValidate and Zod
- [Plain HTML and web components](client-dom.md): `validonce/dom`
- [Generated clients](client-codegen.md): the kubb, Hey API and orval plugins
- [Loading rules at runtime](live-rules.md): fetch rules when the page loads instead of at build time

## AI tooling

- [Migrating an existing project with an agent](agentic-migration.md): the MCP server and the skill, what the agent does, safety, limits and test results
- [MCP server](../mcp/README.md): the tools, the differential check and the read-only promise
- [Skill: validonce-migrate](../skills/validonce-migrate/SKILL.md): the steps, with per-library guides in [`references/`](../skills/validonce-migrate/references/) and the old-validator runners in [`scripts/`](../skills/validonce-migrate/scripts/README.md)
- [AGENTS.md](../AGENTS.md): guidance for coding agents working with validonce

## Reference

- [How it works](how-it-works.md): the flow from server rules to browser feedback
- [Rule format v1](rule-format-v1.md): the rule kinds, conditions and exact semantics
- [How validonce compares](comparison.md): other approaches
- [Regex findings](regex-findings.md): portability of `pattern` rules across regex engines
- [Releasing](releasing.md): how a release is prepared and published
