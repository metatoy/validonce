// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `public/` (frames, CRD) is filled by scripts/prepare.mjs and copied into dist/ by the build.
// base "./" keeps the site relocatable.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
