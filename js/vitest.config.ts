// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { configDefaults, defineConfig } from "vitest/config";

// kubb, Hey API and orval need Node 22.18 or later. The library still supports Node 20, so tests
// that load a generator itself only run on 22+.
const node = Number(process.versions.node.split(".")[0]);

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ...(node < 22 ? ["test/kubb.test.ts"] : [])],
  },
});
