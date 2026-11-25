# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

# Build from the REPO ROOT (the example depends on the `js` package through the pnpm workspace):
#   docker build -f examples/fastify-app/Dockerfile -t validonce-fastify .
#   docker run --rm -p 8020:8020 validonce-fastify      # GET http://localhost:8020/ -> {"ok":true}
FROM node:22-slim AS build
ENV CI=true
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY js ./js
COPY examples/fastify-app ./examples/fastify-app
RUN pnpm install --frozen-lockfile --filter validonce-example-fastify-app...
RUN pnpm -C js build && pnpm -C examples/fastify-app build
# A self-contained production tree (the workspace package is copied in, not linked).
RUN pnpm --filter validonce-example-fastify-app deploy --prod /out \
 && cp -r examples/fastify-app/dist /out/dist

FROM node:22-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8020
# Coolify runs curl or wget inside the container for its health check; node:22-slim has neither.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /out/ ./
USER node
EXPOSE 8020
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD curl -fsS http://127.0.0.1:8020/ || exit 1
CMD ["node", "dist/main.js"]
