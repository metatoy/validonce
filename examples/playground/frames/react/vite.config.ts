// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "./" so the bundle can be served from a subfolder of the shell.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
