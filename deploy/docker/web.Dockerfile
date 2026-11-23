# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
#
# The React example form, built with pnpm and served by unprivileged nginx. Build from the repo root:
#   docker build -f deploy/docker/web.Dockerfile -t validonce-demo-web:dev .
# The context must be the repo root: the form depends on the workspace package js/ (workspace:*).

FROM node:22.23.5-bookworm-slim AS build
RUN npm install --global pnpm@9.15.0
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile --filter "validonce-example-react-form..."
RUN pnpm --filter validonce build
RUN pnpm --filter validonce-example-react-form build

FROM nginxinc/nginx-unprivileged:1.28.2-alpine
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/examples/react-form/dist /usr/share/nginx/html
# The base image already runs as uid 101 (nginx) and listens on 8080.
USER 101
EXPOSE 8080
