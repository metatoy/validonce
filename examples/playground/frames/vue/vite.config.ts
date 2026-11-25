// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// base "./" so the bundle can be served from a subfolder of the shell.
export default defineConfig({
  base: "./",
  plugins: [vue()],
  build: { outDir: "dist", emptyOutDir: true },
});
