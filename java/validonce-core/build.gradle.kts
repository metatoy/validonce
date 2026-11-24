// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

plugins {
    `java-library`
    `maven-publish`
    signing
}

dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:${property("springBootVersion")}"))
    api("com.fasterxml.jackson.core:jackson-databind")

    testImplementation(platform("org.junit:junit-bom:5.12.2"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testImplementation("org.assertj:assertj-core")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

val conformanceDir = rootDir.parentFile.resolve("conformance/rules")

tasks.test {
    systemProperty("validonce.conformance", conformanceDir.absolutePath)
    inputs.dir(conformanceDir)
}
