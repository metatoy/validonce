// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { defineConfig } from "@hey-api/openapi-ts";
import { validonce } from "validonce/hey-api";

export default defineConfig({
  input: "../../../conformance/golden/aspnet.openapi.json",
  output: "src/gen",
  plugins: ["zod", validonce()],
});
