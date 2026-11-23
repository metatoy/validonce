// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Real orval and kubb output from the golden OpenAPI files, each followed by `validonce wrap`.
// orval runs wrap itself from hooks.afterAllFilesWrite (see orval.config.mjs); kubb has no
// equivalent hook, so this script runs wrap after `kubb generate`.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
const bin = (name) => fileURLToPath(new URL(`../node_modules/.bin/${name}`, import.meta.url));

const specs = {
  aspnet: "../../conformance/golden/aspnet.openapi.json",
  fastapi: "../../conformance/golden/fastapi.openapi.json",
  "signup-input": "./gen/signup-input.openapi.json",
};

run(process.execPath, ["scripts/make-input-variant.mjs"]);
run(bin("orval"), ["--config", "orval.config.mjs"]);
run(bin("kubb"), ["generate", "--config", "kubb.config.ts"]);
for (const [name, openapi] of Object.entries(specs))
  run(bin("validonce"), [
    "wrap",
    "--openapi", openapi,
    "--zod", `./gen/kubb-${name}/schemas.ts`,
    "-o", `./gen/kubb-${name}/schemas.rules.ts`,
  ]);
