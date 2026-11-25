# Build from the repository root (the module uses a replace to ../../go):
#   docker build -f examples/go-app/Dockerfile -t validonce-go-app .
# Health: GET /healthz -> {"ok":true}. A static busybox wget is copied in because Coolify runs its
# health check inside the container with curl or wget (it ignores a Dockerfile HEALTHCHECK).
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go ./go
COPY examples/go-app ./examples/go-app
WORKDIR /src/examples/go-app
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/go-app .

FROM busybox:stable-musl AS busybox

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=busybox /bin/busybox /bin/wget
# Coolify runs the health check through /bin/sh, which distroless lacks; busybox provides it.
COPY --from=busybox /bin/busybox /bin/sh
COPY --from=build /out/go-app /go-app
ENV ADDR=0.0.0.0:8040
EXPOSE 8040
USER nonroot
ENTRYPOINT ["/go-app"]
