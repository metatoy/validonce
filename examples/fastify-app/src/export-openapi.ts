// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

/** Write the OpenAPI document to a file without starting a server: node dist/export-openapi.js OUT. */
import { writeFileSync } from "node:fs";
import { buildApp } from "./app";

const out = process.argv[2];
if (!out) {
  console.error("usage: export-openapi OUT.json");
  process.exit(1);
}
const app = await buildApp();
writeFileSync(out, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
