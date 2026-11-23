// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Zod schemas from orval, then `validonce wrap` from afterAllFilesWrite (the recipe in js/README.md).
const specs = {
  aspnet: "../../conformance/golden/aspnet.openapi.json",
  fastapi: "../../conformance/golden/fastapi.openapi.json",
  "signup-input": "./gen/signup-input.openapi.json",
};

export default Object.fromEntries(
  Object.entries(specs).map(([name, input]) => [
    `orval-${name}`,
    {
      input,
      output: {
        client: "zod",
        mode: "single",
        target: `./gen/orval-${name}/schemas.ts`,
        override: { zod: { generateReusableSchemas: true } },
      },
      hooks: {
        afterAllFilesWrite: {
          // orval appends the generated files to a command unless this is false.
          command: `node ../../js/dist/cli.js wrap --openapi ${input} --zod ./gen/orval-${name}/schemas.ts -o ./gen/orval-${name}/schemas.rules.ts`,
          injectGeneratedDirsAndFiles: false,
        },
      },
    },
  ]),
);
