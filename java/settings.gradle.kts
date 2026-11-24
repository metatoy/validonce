// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

rootProject.name = "validonce-java"

include("validonce-core", "validonce-spring", "spring-app")
project(":spring-app").projectDir = file("../examples/spring-app")
