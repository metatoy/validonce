# validonce Fastify example

`POST /signups` with a `Signup` body; the rules live in `src/app.ts`.

```
pnpm -C ../../js build     # once: the example uses the built validonce package
pnpm start                 # http://127.0.0.1:8020
```

OpenAPI (with `components.schemas.Signup["x-validonce"]`) is at
`http://127.0.0.1:8020/openapi.json`. Export it without a server:

```
pnpm export-openapi ../../conformance/golden/fastify.openapi.json
```
