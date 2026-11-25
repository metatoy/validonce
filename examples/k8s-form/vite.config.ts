// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true, host: true },
});
