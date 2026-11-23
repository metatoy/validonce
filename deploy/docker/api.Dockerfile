# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
#
# The FastAPI example. Build from the repo root:
#   docker build -f deploy/docker/api.Dockerfile -t validonce-demo-api:dev .
# The context must be the repo root: the app depends on ../../python through a uv path source,
# and the package's build hook reads docs/regex-findings.json.

FROM ghcr.io/astral-sh/uv:0.12.1 AS uv

FROM python:3.13.18-slim-bookworm AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /src
COPY docs/regex-findings.json docs/regex-findings.json
COPY python python
COPY examples/fastapi-app/pyproject.toml examples/fastapi-app/uv.lock examples/fastapi-app/
WORKDIR /src/examples/fastapi-app
# Install validonce as a regular (non-editable) package so the runtime image needs no sources.
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.13.18-slim-bookworm
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY examples/fastapi-app/app.py /app/app.py
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
USER 10001:10001
EXPOSE 8010
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8010"]
