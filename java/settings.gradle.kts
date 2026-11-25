// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

rootProject.name = "validonce-java"

include("validonce-core", "validonce-spring", "spring-app")
project(":spring-app").projectDir = file("../examples/spring-app")

// Codegen golden test (CI only). Absent in the Spring example image, which copies only java/ and the example.
val codegenGolden = file("../mcp/test/golden-java")
if (codegenGolden.isDirectory) {
    include("codegen-golden")
    project(":codegen-golden").projectDir = codegenGolden
}
