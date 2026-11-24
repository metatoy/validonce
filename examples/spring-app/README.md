# validonce Spring Boot example

`POST /signups` with a `Signup` body; the rules are in `SignupRules.java`. Port 8050.

```
cd java && ./gradlew :spring-app:bootRun
```

OpenAPI (with `components.schemas.Signup["x-validonce"]`) is at `http://localhost:8050/v3/api-docs`.
Refresh the committed copy (`conformance/golden/spring.openapi.json`) without a server:

```
cd java && ./gradlew :spring-app:exportOpenApi
```

`./gradlew check` fails when the app's document differs from the committed one.
