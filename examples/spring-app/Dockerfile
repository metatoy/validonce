# Build from the repository root (Gradle project is under java/, the app under examples/spring-app):
#   docker build -f examples/spring-app/Dockerfile -t validonce-spring-app .
# Sized for a 256 MB limit. Health: GET /healthz -> {"ok":true}; a static busybox wget is
# copied in because Coolify runs its health check inside the container with curl or wget.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY java ./java
COPY examples/spring-app ./examples/spring-app
WORKDIR /src/java
RUN ./gradlew --no-daemon :spring-app:bootJar -x test

FROM busybox:stable-musl AS busybox

FROM eclipse-temurin:21-jre
COPY --from=busybox /bin/busybox /bin/wget
RUN useradd --system --uid 10001 app
COPY --from=build /src/examples/spring-app/build/libs/spring-app.jar /app/spring-app.jar
USER app
EXPOSE 8050
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss512k -XX:MaxMetaspaceSize=96m"
ENTRYPOINT ["java", "-jar", "/app/spring-app.jar"]
