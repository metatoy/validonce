# validonce for Java and Kotlin

Write cross-field validation rules once, next to a Java record or Kotlin data class. Spring Boot enforces them inside the normal `@Valid` flow, springdoc publishes them in the OpenAPI document under `x-validonce`, and browser forms (React, Angular, Vue, plain HTML) enforce the same rules.

This README is a landing page on GitHub. It is not part of the published artifacts' build.

## Modules

| Artifact | What |
|---|---|
| `com.metatoy:validonce-spring` | Spring Boot integration: auto-configuration, `@ValidonceRules`, springdoc export, 422 problem details. Brings `validonce-core`. |
| `com.metatoy:validonce-core` | Rule model, evaluator and builders, with no Spring dependency. |

## Install

Needs Java 21 and Spring Boot 3.5.

```kotlin
dependencies {
    implementation("com.metatoy:validonce-spring:0.5.0")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:2.8.17")
}
```

## Example

```java
@ValidonceRules(SignupRules.class)
public record Signup(
        @NotNull Plan plan,
        String company,
        @NotNull @Size(min = 1) String email,
        @NotNull LocalDate start,
        LocalDate end,
        @NotNull Integer quantity) {}

public final class SignupRules extends RuleDefinition<Signup> {
    public SignupRules() { super(Signup.class); }

    @Override
    protected void define(RuleSetBuilder<Signup> r) {
        r.requiredWhen("company", Condition.eq("plan", "pro")).key("rules.company_required")
         .compare("end", Op.GE, "start").key("rules.end_after_start")
         .compareValue("quantity", Op.GE, 1).key("rules.quantity_min").param("min", 1);
    }
}

@PostMapping("/signups")
Map<String, Boolean> create(@Valid @RequestBody Signup body) { return Map.of("ok", true); }
```

`/v3/api-docs` then has the rules under `components.schemas.Signup["x-validonce"]`, and a request that breaks a rule gets 422 problem details with the issues in a top-level `validonce` member. The Kotlin version and the details are in [Getting started: Spring Boot](https://github.com/metatoy/validonce/blob/main/docs/getting-started-spring.md).

## Links

- [Getting started: Spring Boot](https://github.com/metatoy/validonce/blob/main/docs/getting-started-spring.md)
- [Rule format v1](https://github.com/metatoy/validonce/blob/main/docs/rule-format-v1.md)
- [Migrating an existing project with an agent](https://github.com/metatoy/validonce/blob/main/docs/agentic-migration.md): the `validonce-mcp` server and skill can move Jakarta Bean Validation checks to these rules (needs `validonce-mcp` 0.2.0 or later)
- [Playground](https://playground.metatoy.com)
- [Repository](https://github.com/metatoy/validonce)

## License

Copyright 2026 Metatoy LLC. Licensed under the Apache License, Version 2.0. See `LICENSE` and `NOTICE` in the repository root.
