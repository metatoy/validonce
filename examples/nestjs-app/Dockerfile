# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC

# Build from the REPO ROOT (the example depends on the `js` package through the pnpm workspace):
#   docker build -f examples/nestjs-app/Dockerfile -t validonce-nestjs .
#   docker run --rm -p 8030:8030 validonce-nestjs      # GET http://localhost:8030/ -> {"ok":true}
FROM node:22-slim AS build
ENV CI=true
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY js ./js
COPY examples/nestjs-app ./examples/nestjs-app
RUN pnpm install --frozen-lockfile --filter validonce-example-nestjs-app...
RUN pnpm -C js build && pnpm -C examples/nestjs-app build
# A self-contained production tree (the workspace package is copied in, not linked).
RUN pnpm --filter validonce-example-nestjs-app deploy --prod /out \
 && cp -r examples/nestjs-app/dist /out/dist

FROM node:22-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8030
WORKDIR /app
COPY --from=build --chown=node:node /out/ ./
USER node
EXPOSE 8030
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8030/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
