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

## Contact (playground)

`POST /contacts` takes the shared `Contact` contract (see `examples/CONTRACT.md`): stateless, no body logging, 16 KB body cap, CORS for `https://playground.metatoy.com` and `http://localhost:5180`. `GET /` is a health check. `pnpm test` runs the Contact tests.

## Docker

Build from the **repo root** (the example depends on `js` through the workspace):

```
docker build -f examples/fastify-app/Dockerfile -t validonce-fastify .
docker run --rm -p 8020:8020 validonce-fastify
```

The server listens on `HOST` (default `127.0.0.1`; the image sets `0.0.0.0`) and `PORT`.
