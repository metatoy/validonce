// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Resolves the runner's libraries into libs/ (Hibernate Validator, the Expression Language
// implementation it needs, Jackson). Use the user's own versions if they differ: edit the
// versions below to match the project, so whatever version the user has is the version tested.
//   gradle -q libs
//   javac -cp "libs/*" -d classes Model.java
//   java -cp "libs/*:classes" Runner.java Model inputs.jsonl out.jsonl
plugins { java }

repositories { mavenCentral() }

dependencies {
  implementation("org.hibernate.validator:hibernate-validator:8.0.2.Final")
  implementation("org.glassfish.expressly:expressly:5.0.0")
  implementation("com.fasterxml.jackson.core:jackson-databind:2.18.2")
  // Spring Boot registers these by default: java.time types, and record / constructor parameter names.
  implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.18.2")
  implementation("com.fasterxml.jackson.module:jackson-module-parameter-names:2.18.2")
}

tasks.register<Copy>("libs") {
  from(configurations.runtimeClasspath)
  into(layout.projectDirectory.dir("libs"))
}
