# Getting started: Spring Boot

> **Try it first:** [the playground with Spring Boot](https://playground.metatoy.com/?backend=spring&frontend=react) runs this backend live, with React, Angular, Vue or a plain form.

Write cross-field rules once, next to your request type. The server enforces them inside the normal `@Valid` flow and springdoc publishes them in OpenAPI. Needs Java 21 and Spring Boot 3.5 (Jackson 2, Hibernate Validator, springdoc 2.8).

## 1. Install

```kotlin
dependencies {
    implementation("com.metatoy:validonce-spring:0.5.0")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:2.8.17")
}
```

`validonce-spring` brings `validonce-core` (rule model, evaluator, builders) and registers itself through Spring Boot auto-configuration.

## 2. Write the rules

Fields are Jackson property names, the names in the JSON body.

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

The same in Kotlin:

```kotlin
@ValidonceRules(SignupRules::class)
data class Signup(val plan: Plan, val company: String?, val email: String,
                  val start: LocalDate, val end: LocalDate?, val quantity: Int)

class SignupRules : RuleDefinition<Signup>(Signup::class.java) {
    override fun define(r: RuleSetBuilder<Signup>) {
        r.requiredWhen("company", Condition.eq("plan", "pro")).key("rules.company_required")
            .compare("end", Op.GE, "start").key("rules.end_after_start")
            .compareValue("quantity", Op.GE, 1).key("rules.quantity_min").param("min", 1)
    }
}
```

Other builders: `atLeastOneOf`, `exactlyOneOf`, `allOrNone`, and the conditions `ne`, `in`, `present`, `absent`, `all`, `any`, `not`. After a rule, `.key()`, `.param()`, `.id()`, `.path()`, `.serverOnly()` and `.type()` set its options.

## 3. What you get

`/v3/api-docs` has the rules under `components.schemas.Signup["x-validonce"]` (set `springdoc.api-docs.version=openapi_3_1` for an OpenAPI 3.1 document).

A request that breaks a rule gets 422 problem details, with every failing rule in a top-level `validonce` member:

```json
{
  "type": "about:blank",
  "title": "One or more validation errors occurred.",
  "status": 422,
  "validonce": [
    { "path": ["company"], "ruleId": "Signup.required_when.company", "key": "rules.company_required", "params": {} }
  ]
}
```

Other `@Valid` failures (such as `@NotNull`) are listed under `errors`, field to messages, in the same 422. In the browser, `issuesFromProblemDetails` or `issuesFromResponse` from `validonce/server-errors` turns the body back into issues.

## Gotchas

- **Wrong rules stop startup.** An unknown field, a field type that `compare` does not support (`boolean`, `LocalDateTime`) or two rules with the same id throws when the application starts, not on the first request. This covers types used as controller parameters or return types.
- **Rules see the wire form**: the bean serialized with the application's `ObjectMapper`. A `@JsonProperty` or naming strategy changes the names to use in rules.
- **`compare` types** are inferred: numbers, `String`, `LocalDate`, and `OffsetDateTime`/`ZonedDateTime`/`Instant`. Use `.type(CompareType.DATE)` for a `String` field that carries dates.
- **Rules run beside field constraints**, not after them, so one 422 can carry both `validonce` and `errors`.
- **Hibernate Validator** is required (it is the Spring Boot default); the issues travel as violation payloads.
- Ids default to `TypeName.kind.field`. Pass `.id(...)` on a collision.
- The `x-validonce` schema is matched by the class's simple name, springdoc's default schema name.

Next: the [React guide](client-react.md) or [Angular guide](client-angular.md). Runnable example: [examples/spring-app](../examples/spring-app/README.md).
