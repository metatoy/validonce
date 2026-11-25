// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { adapterOas } from "@kubb/adapter-oas";
import { pluginZod } from "@kubb/plugin-zod";
import { defineConfig } from "kubb/config";
import { pluginValidonce } from "validonce/kubb";

export default defineConfig({
  root: ".",
  input: "../../../conformance/golden/aspnet.openapi.json",
  adapter: adapterOas(),
  output: { path: "./src/gen", clean: true },
  plugins: [
    pluginZod({ output: { path: "./schemas.ts" } }),
    // After pluginZod: writes src/gen/validonce.gen.ts, the same schemas with the rules attached.
    pluginValidonce(),
  ],
});
