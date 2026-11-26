# Generated clients: kubb, Hey API, orval

If your frontend generates its API client and Zod schemas from OpenAPI, the generated schemas have
the field rules (types, enums, formats, required) but not the cross-field ones: generators ignore
`x-validonce`. A validonce plugin fixes that. After each generation run it writes one extra file,
`validonce.gen.ts`, next to the generator's output. That file re-exports every schema under the same
name, with `withRules` attached wherever the OpenAPI schema has `x-validonce`:

```ts
// validonce.gen.ts (generated; do not edit)
export * from "./zod.gen";
export const zSignup = _withRules(_gen.zSignup, { version: 1, rules: [ /* from x-validonce */ ] });
```

Change one import (`./zod.gen` becomes `./validonce.gen`), and the form enforces the server's
cross-field rules before submit. The rules are copied at generation time: no runtime fetch, and
changes show up in code review. The generator's own files are never modified.

The schemas are plain Zod 4, so they work with every validonce frontend: `zodResolver` in React,
Angular Signal Forms or `validonce/angular`, `toVeeSchema` in Vue. For plain HTML and web components,
pass the rules to `attachRules`.

The generators themselves need **Node 22.18 or later** (their own requirement); the plugins run wherever the generator runs. The rest of validonce still supports Node 20.

## kubb

```ts
// kubb.config.ts
import { pluginZod } from "@kubb/plugin-zod";
import { defineConfig } from "kubb/config";
import { pluginValidonce } from "validonce/kubb";

export default defineConfig({
  input: "./openapi.json",
  output: { path: "./src/gen" },
  plugins: [pluginZod(), pluginValidonce()], // after pluginZod
});
```

- Works with plugin-zod's default layout (one file per schema under `zod/`) and with a single file
  (`pluginZod({ output: { path: "./schemas.ts" } })`). Exports are named `signupSchema`.
- Options: `zod` (plugin-zod's file or directory, relative to `output.path`), `output` (default
  `validonce.gen.ts`), `map` (`{ Signup: "exportName" }` when names don't match).
- kubb 5.23 or later; the input must be a local OpenAPI JSON file.

## Hey API (`@hey-api/openapi-ts`)

```ts
// openapi-ts.config.ts
import { defineConfig } from "@hey-api/openapi-ts";
import { validonce } from "validonce/hey-api";

export default defineConfig({
  input: "./openapi.json",
  output: "src/gen",
  plugins: ["zod", validonce()],
});
```

- Writes `src/gen/validonce.gen.ts` beside `zod.gen.ts`. Exports are named `zSignup`.
- Option: `fileName` (default `validonce.gen.ts`).
- Needs Zod 4 output (Hey API's default). It stops with an error on `compatibilityVersion: 3` or
  `mini`.
- `@hey-api/openapi-ts` 0.99.x. Its plugin API is still 0.x, so the supported range is narrow and
  widens as it is tested.

## orval

```js
// orval.config.mjs
import { withValidonce } from "validonce/orval";

export default withValidonce({
  signup: {
    input: "./openapi.json",
    output: {
      client: "zod",
      mode: "single",
      target: "./src/gen/schemas.ts",
      override: { zod: { generateReusableSchemas: true, version: 4 } },
    },
  },
});
```

- `withValidonce` adds an input transformer and an `afterAllFilesWrite` hook to every project. Hooks
  you already have are kept, and the validonce hook runs last.
- If you compose hooks yourself, `createValidonce({ zodFile })` returns the two pieces separately.
- Options: `fileName` (default `validonce.gen.ts`), `zodFile` (needed unless `output.mode` is
  `single`), `map`.
- Exports keep orval's names (`Signup`). orval only logs errors thrown in hooks, so the validonce
  hook also sets a failing exit code; CI notices a broken generation.
- orval 8. Zod 3 output and the `mini` variant are rejected.

## Any other generator: `validonce wrap`

The plugins call the same code as the CLI. For a generator without a plugin, run it after
generation:

```sh
npx validonce wrap --openapi openapi.json --zod src/gen/schemas.ts -o src/gen/validonce.gen.ts --style auto
```

`--style` is `auto` (default), `orval` (`Signup`), `kubb` (`signupSchema`) or `hey-api` (`zSignup`);
`--map Name=export` names any other export. See [js/README.md](../js/README.md).

## Notes

- **Aliases.** Generators also export per-operation aliases of a schema (orval `PostSignupsBody`,
  kubb `postSignupsBodySchema`). These stay unwrapped, and generation prints a warning. Import the
  component schema (`Signup`, `signupSchema`, `zSignup`) in forms, or name the alias with `map`.
- **Schemas that aren't objects** (`allOf` intersections, unions) can't take `withRules`. They're
  re-exported unchanged with a warning.
- **Kubernetes.** The plugins read `x-validonce` from any OpenAPI document. A CRD translated with
  `validonce k8s` (see [Kubernetes custom resources](kubernetes.md)) works too.

Working setups for each generator are in [`examples/codegen-clients`](../examples/codegen-clients).
CI regenerates them, fails if the committed output changes, and tests that the generated schemas
enforce the Signup rules.
