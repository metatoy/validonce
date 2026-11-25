# Build from the repository root (the module uses a replace to ../../go):
#   docker build -f examples/go-app/Dockerfile -t validonce-go-app .
# Health: GET /healthz -> {"ok":true} (the image has no shell or curl; probe it from the orchestrator).
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go ./go
COPY examples/go-app ./examples/go-app
WORKDIR /src/examples/go-app
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/go-app .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/go-app /go-app
ENV ADDR=0.0.0.0:8040
EXPOSE 8040
USER nonroot
ENTRYPOINT ["/go-app"]
