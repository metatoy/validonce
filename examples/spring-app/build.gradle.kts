// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

plugins {
    java
    id("org.springframework.boot")
}

dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:${property("springBootVersion")}"))
    implementation(project(":validonce-spring"))
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:${property("springdocVersion")}")

    testImplementation(platform("org.junit:junit-bom:5.12.2"))
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

val goldenFile = rootDir.parentFile.resolve("conformance/golden/spring.openapi.json")

tasks.test {
    systemProperty("validonce.golden", goldenFile.absolutePath)
    inputs.file(goldenFile).optional()
}

// ./gradlew :spring-app:exportOpenApi rewrites conformance/golden/spring.openapi.json (CI then checks git diff).
tasks.register<Test>("exportOpenApi") {
    group = "verification"
    description = "Writes the OpenAPI document to conformance/golden/spring.openapi.json."
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform()
    filter { includeTestsMatching("*OpenApiExportTest") }
    systemProperty("validonce.export", goldenFile.absolutePath)
    outputs.upToDateWhen { false }
}

// A fixed name, so CI and the docs don't change with each version.
tasks.bootJar {
    archiveFileName.set("spring-app.jar")
}
