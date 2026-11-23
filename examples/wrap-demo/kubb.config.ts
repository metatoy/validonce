// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { adapterOas } from "@kubb/adapter-oas";
import { pluginZod } from "@kubb/plugin-zod";
import { defineConfig } from "kubb/config";

const specs = {
  aspnet: "../../conformance/golden/aspnet.openapi.json",
  fastapi: "../../conformance/golden/fastapi.openapi.json",
  "signup-input": "./gen/signup-input.openapi.json",
};

export default defineConfig(
  Object.entries(specs).map(([name, input]) => ({
    name: `kubb-${name}`,
    root: ".",
    input,
    adapter: adapterOas(),
    output: { path: `./gen/kubb-${name}`, clean: true },
    plugins: [pluginZod({ output: { path: "./schemas.ts" } })],
  })),
);
