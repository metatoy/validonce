// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Writes gen/signup-input.openapi.json: the FastAPI golden with `Signup` renamed to `Signup-Input`,
// the way FastAPI names a model used for both requests and responses.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const src = new URL("../../../conformance/golden/fastapi.openapi.json", import.meta.url);
const text = readFileSync(src, "utf8")
  .replaceAll('"#/components/schemas/Signup"', '"#/components/schemas/Signup-Input"')
  .replace(/^(\s*)"Signup": \{/m, '$1"Signup-Input": {');
const doc = JSON.parse(text);
if (!doc.components.schemas["Signup-Input"]) throw new Error("rename failed");
mkdirSync(new URL("../gen", import.meta.url), { recursive: true });
writeFileSync(new URL("../gen/signup-input.openapi.json", import.meta.url), `${JSON.stringify(doc, null, 2)}\n`);
