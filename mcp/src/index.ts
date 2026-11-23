// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { serveStdio } from "./sdk";
import { buildServer } from "./server";

serveStdio(buildServer()).catch((e) => {
  console.error("validonce-mcp failed to start:", e instanceof Error ? e.message : e);
  process.exit(1);
});
