# Jakarta Bean Validation (Java, Kotlin, Spring) to validonce

Target: `validonce-spring` (`@ValidonceRules(SignupRules.class)` on the class, a `RuleDefinition<T>` with `r.requiredWhen(...)`, `compare(...)`, `compareValue(...)`, `atLeastOneOf(...)`, `exactlyOneOf(...)`, `allOrNone(...)`; see `docs/getting-started-spring.md`). Your field annotations (`@NotNull`, `@Size`, `@Email`) keep working beside the rules. Run the old validator with `scripts/java-runner/` (JDK 21, Hibernate Validator; it binds each line with Jackson, then calls the default `Validator`). Ground truth: `testbeds/before/jakarta/`.

Wire names: validonce rules use the **Jackson property names**, the names in the JSON body (`@JsonProperty("postalCode")`, a global `PropertyNamingStrategy`). A constraint's property path uses the **Java** names. The runner maps the first path node through Jackson's own view of the class, so `postal_code` vs `postalCode` is handled for fields Jackson sees; a path it cannot map (see `@AssertTrue` below) is reported as-is.

## Where cross-field checks hide

- **Class-level constraints:** an annotation on the type with `@Constraint(validatedBy = X.class)` whose `isValid(T value, ConstraintValidatorContext c)` reads several properties. Often named `@PasswordsMatch`, `@DateRange`, `@ValidAddress`. Check `addPropertyNode(...)`: it decides which field the error lands on.
- **`@AssertTrue` / `@AssertFalse` methods** (`isEndAfterStart()`), including on records and in Kotlin (`@get:AssertTrue val endAfterStart: Boolean get() = ...`).
- **Cross-parameter constraints** on methods (`@SupportedValidationTarget(CROSS_PARAMETER)`).
- **Spring `Validator`** (`implements Validator`, `supports`/`validate(Object, Errors)` with `errors.rejectValue("end", ...)`), `@InitBinder` binders, and `Validated` groups.
- **Hibernate Validator extras:** `@ScriptAssert`, `@ParameterScriptAssert`.
- **Kotlin:** same annotations, with use-site targets (`@field:`, `@get:`); data classes make `null` and missing the same thing.

## Before to after, per kind

### required_when

```java
// before: class-level
if ("pro".equals(m.plan) && (m.company == null || m.company.isEmpty())) { fail(c, "company"); ok = false; }
```
```java
// after, in the RuleDefinition
r.requiredWhen("company", Condition.eq("plan", "pro")).key("rules.company_required")
```
`Condition.ne`, `in`, `present`, `absent`, `all`, `any`, `not` cover the other shapes (`!x.isBlank()` is `present`).

### compare

```java
// before
@AssertTrue boolean isEndAfterStart() { return end == null || start == null || !end.isBefore(start); }
```
```java
// after
r.compare("end", Op.GE, "start").key("rules.end_after_start")
r.compareValue("quantity", Op.GE, 1).key("rules.quantity_min").param("min", 1)
```
The `end == null || start == null` guard is what `compare` does by itself and is dropped. Types: numbers, strings, `LocalDate`, `OffsetDateTime`/`Instant`. A `LocalDateTime` (no offset) has no wire meaning: change the model type (ask first) or keep the check.

### at_least_one_of / exactly_one_of / all_or_none

```java
r.atLeastOneOf("email", "phone").key("rules.contact_email_or_phone")
r.exactlyOneOf("card", "invoice").key("rules.pay_one")
r.allOrNone("street", "city", "postalCode").path("street").key("rules.address_all_or_none")
```
`.path("street")` sets where the error lands when the old validator reported on a specific field.

## Traps

- **Blank:** validonce's blank is null, missing, `""` or `[]`. `@NotBlank` also rejects `"   "` (whitespace) and `@NotEmpty` does not: a `" "` is **not** blank in validonce. If the old check uses `isBlank()` or `StringUtils.hasText`, keep that rule hand-written or the differential check will show it.
- **`@AssertTrue` path.** A violation on `isEndAfterStart()` has the path `endAfterStart`, a name that is not a wire field. After migration the error lands on the rule's field; the old path shows as a warning (different field, same verdict). Use `.path(...)` to choose.
- **Null is valid.** Most JSR-380 annotations (`@Min`, `@Size`, `@Pattern`, `@Past`) accept `null`; `compare` also passes when a side is blank, but `@NotNull` does not. Keep requiredness as its own annotation.
- **`@Min(1)` on `int`** never sees null (default `0` fails it); on `Integer` null passes. validonce treats `0` as present. Check the field type before translating.
- **Decimals:** `BigDecimal`/`long` beyond 2^53 are compared as doubles by validonce. Keep such checks hand-written.
- **Validation groups** (`@Validated(OnCreate.class)`) mean the rule only applies in some requests: keep hand-written, or `serverOnly` with a note.
- **Jackson binding:** `FAIL_ON_UNKNOWN_PROPERTIES`, `@JsonSetter(nulls = ...)` and coercion change what the validator sees; the runner reads with Jackson defaults except unknown properties (ignored). Match the app's `ObjectMapper` if it differs, and say so in the report.
- **Records and Kotlin data classes** need `jackson-module-parameter-names` / `jackson-module-kotlin` on the runner's classpath (add them to `java-runner/build.gradle.kts`).

## What stays hand-written

Checks that call a repository, a service or a clock (`@UniqueEmail`, `@FutureOrPresent` against `Clock`), a validator with injected beans (cannot be built by the plain `Validator`; the runner reports it as an `error`, not a rejection: say "cannot prove"), checks over collections (`@Valid` cascades, per-element constraints), and anything with regex over several fields. Field-level annotations stay as they are.
