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

## Contact (`POST /contacts`) and Docker

The playground contract (see `examples/CONTRACT.md`): stateless, no body logging, 16 KB body cap (413 from `BodyLimitFilter`, which also counts chunked and streamed bodies), 200 `{"ok": true}`. `GET /healthz` is the health path (the Dockerfile ships a busybox `wget` so Coolify's in-container health check works). CORS also allows `https://playground.metatoy.com` and `http://localhost:5180`.

```
docker build -f examples/spring-app/Dockerfile -t validonce-spring-app .   # context: repository root
docker run --rm -m 256m -p 8050:8050 validonce-spring-app
```
