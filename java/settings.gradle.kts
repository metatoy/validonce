// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

rootProject.name = "validonce-java"

include("validonce-core", "validonce-spring", "spring-app", "codegen-golden")
project(":spring-app").projectDir = file("../examples/spring-app")
project(":codegen-golden").projectDir = file("../mcp/test/golden-java")
