// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Resolves the jars of the Java fixtures (and of the runner) into -Pout=<dir>. Run once per scratch root.
plugins { java }

repositories { mavenCentral() }

dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:3.5.16"))
    implementation("org.hibernate.validator:hibernate-validator")
    implementation("org.glassfish.expressly:expressly:5.0.0")
    implementation("com.fasterxml.jackson.core:jackson-databind")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
    implementation("com.fasterxml.jackson.module:jackson-module-parameter-names")
    implementation("org.springframework:spring-webmvc")
    implementation("org.springframework.boot:spring-boot-autoconfigure")
}

tasks.register<Copy>("libs") {
    from(configurations.runtimeClasspath)
    into(providers.gradleProperty("out").get())
}
