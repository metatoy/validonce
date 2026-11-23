# validonce ASP.NET example

Minimal API implementing the shared `POST /signups` contract (same rules as the FastAPI example).
Copyright 2026 Metatoy LLC. Apache-2.0.

## Run

```
dotnet run --project examples/aspnet-app
```

Listens on `http://localhost:5080` (override with `ASPNETCORE_URLS`). CORS allows
`http://localhost:5173` and `http://127.0.0.1:5173`.

- `POST /signups` — 200 `{"ok": true}`, or 422 ProblemDetails with the `validonce` issue list.
- `GET /openapi/v1.json` — OpenAPI document; `components.schemas.Signup["x-validonce"]` holds the rules.

## Export the OpenAPI document

```
dotnet run --project examples/aspnet-app -- --export-openapi path/to/openapi.json
```

Starts a throwaway in-process server on a random loopback port, writes the document
(indented, `servers` removed so the bytes are identical every run), and exits.
