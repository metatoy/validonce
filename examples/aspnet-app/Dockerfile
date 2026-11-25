# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Metatoy LLC
#
# Playground deployment of the ASP.NET example.
# Build from the repo root:  docker build -f examples/aspnet-app/Dockerfile -t validonce-play-aspnet .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY dotnet/Directory.Build.props dotnet/global.json dotnet/
COPY dotnet/src dotnet/src
COPY examples/aspnet-app examples/aspnet-app
RUN dotnet publish examples/aspnet-app/AspNetApp.csproj -c Release -o /out --no-self-contained \
    -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://0.0.0.0:5080 DOTNET_EnableDiagnostics=0
USER $APP_UID
EXPOSE 5080
# Health check: GET /openapi/v1.json (200 when up).
ENTRYPOINT ["dotnet", "AspNetApp.dll"]
