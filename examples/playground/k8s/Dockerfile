# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

# The playground's simulated Kubernetes API server. Build from the REPO ROOT:
#   docker build -f examples/playground/k8s/Dockerfile -t validonce-play-k8s .
FROM node:22-slim AS build
ENV CI=true
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY js ./js
COPY examples/playground/k8s ./examples/playground/k8s
RUN pnpm install --frozen-lockfile --filter validonce-playground-k8s...
RUN pnpm -C js build
RUN pnpm --filter validonce-playground-k8s deploy --prod /out

FROM node:22-slim
ENV NODE_ENV=production PORT=8060
# Coolify runs curl or wget inside the container for its health check; node:22-slim has neither.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /out/ ./
USER node
EXPOSE 8060
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD curl -fsS http://127.0.0.1:8060/health || exit 1
CMD ["node", "server.mjs"]
