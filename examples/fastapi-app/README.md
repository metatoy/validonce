# validonce FastAPI example

`POST /signups` with a `Signup` body; the rules live on the model in `app.py`.

```
uv run uvicorn app:app --port 8010
```

OpenAPI (with `components.schemas.Signup["x-validonce"]`) is at
`http://localhost:8010/openapi.json`. Export it without a server:

```
uv run python export_openapi.py openapi.json
```
