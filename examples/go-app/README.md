# validonce Go example

Huma implementation of the shared `POST /signups` contract (same fields and rules as the ASP.NET and FastAPI examples).
Copyright 2026 Metatoy LLC. Apache-2.0.

## Run

```
cd examples/go-app && go run .
```

Listens on `localhost:8040` (override with `ADDR`). CORS allows `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4200` and `http://127.0.0.1:4200`.

- `POST /signups`: 200 `{"ok": true}`, or 422 problem details (`application/problem+json`) with the `validonce` issue list. Field errors (a bad `plan`, an empty `email`) get Huma's own 422 first; rules run after the body is valid.
- `GET /openapi.json`: the OpenAPI document; `components.schemas.Signup["x-validonce"]` holds the rules.

## Export the OpenAPI document

```
cd examples/go-app && go run . --export-openapi ../../conformance/golden/go.openapi.json
```

Writes the document without starting a server, so the bytes are identical every run.

## Contact (`POST /contacts`) and Docker

The playground contract (see `examples/CONTRACT.md`): stateless, no body logging, 16 KB body cap (413), 200 `{"ok": true}`. `GET /healthz` is the health path. CORS also allows `https://playground.metatoy.com` and `http://localhost:5180`.

```
docker build -f examples/go-app/Dockerfile -t validonce-go-app .   # context: repository root
docker run --rm -p 8040:8040 validonce-go-app
```
