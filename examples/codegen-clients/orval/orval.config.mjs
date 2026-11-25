// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { withValidonce } from "validonce/orval";

// Zod schemas from orval, then validonce.gen.ts next to them (same names, rules attached).
export default withValidonce({
  signup: {
    input: "../../../conformance/golden/aspnet.openapi.json",
    output: {
      client: "zod",
      mode: "single",
      target: "./src/gen/schemas.ts",
      override: { zod: { generateReusableSchemas: true, version: 4 } },
    },
  },
});
