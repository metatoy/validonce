// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

plugins {
    `java-library`
}

dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:${property("springBootVersion")}"))
    api(project(":validonce-core"))
    api("jakarta.validation:jakarta.validation-api")
    implementation("org.springframework.boot:spring-boot-autoconfigure")
    implementation("org.springframework:spring-webmvc")
    // The user's app supplies these.
    compileOnly("org.hibernate.validator:hibernate-validator")
    compileOnly("org.springdoc:springdoc-openapi-starter-common:${property("springdocVersion")}")
    compileOnly("io.swagger.core.v3:swagger-models-jakarta")

    testImplementation(platform("org.junit:junit-bom:5.12.2"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testImplementation("org.assertj:assertj-core")
    testImplementation("org.springframework.boot:spring-boot-starter-web")
    testImplementation("org.springframework.boot:spring-boot-starter-validation")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springdoc:springdoc-openapi-starter-webmvc-api:${property("springdocVersion")}")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
