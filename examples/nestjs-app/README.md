# validonce NestJS example

`POST /signups` with a `Signup` body; the rules live in `src/app.ts`.

```
pnpm -C ../../js build     # once: the example uses the built validonce package
pnpm start                 # http://127.0.0.1:8030
```

OpenAPI (with `components.schemas.Signup["x-validonce"]`) is at
`http://127.0.0.1:8030/openapi.json`. Export it without a server:

```
pnpm export-openapi ../../conformance/golden/nestjs.openapi.json
```

## Contact (playground)

`POST /contacts` takes the shared `Contact` contract (see `examples/CONTRACT.md`): stateless, no body logging, 16 KB body cap, CORS for `https://playground.metatoy.com` and `http://localhost:5180`. `GET /` is a health check. `pnpm test` runs the Contact tests.

## Docker

Build from the **repo root** (the example depends on `js` through the workspace):

```
docker build -f examples/nestjs-app/Dockerfile -t validonce-nestjs .
docker run --rm -p 8030:8030 validonce-nestjs
```

The server listens on `HOST` (default `127.0.0.1`; the image sets `0.0.0.0`) and `PORT`.
