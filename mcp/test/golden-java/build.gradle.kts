// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Compiles the Java that generate_code wrote (../golden/out-targets/java) against validonce-core and
// validonce-spring, then runs golden.Export to print every generated rule set.
plugins {
    application
}

dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:${property("springBootVersion")}"))
    implementation(project(":validonce-spring"))
    implementation("com.fasterxml.jackson.core:jackson-databind")
}

sourceSets.main {
    java.srcDir(rootDir.parentFile.resolve("mcp/test/golden/out-targets/java"))
}

application {
    mainClass = "golden.Export"
}
