# kubb + validonce

`pluginValidonce()` runs after `pluginZod()` and writes `src/gen/validonce.gen.ts`: the kubb Zod
schemas re-exported with the OpenAPI document's `x-validonce` rules attached (`withRules`).
Import from `validonce.gen` instead of `schemas` and cross-field rules (company required on
pro, end after start, quantity minimum) run in the form, with the server's message keys.

```ts
// kubb.config.ts
plugins: [pluginZod({ output: { path: "./schemas.ts" } }), pluginValidonce()],
```

Options: `zod` (what `pluginZod` writes: one file, or its default per-schema directory `zod/`; default
`schemas.ts` if present, else `zod`), `output` (default
`validonce.gen.ts`), `map` (`{ Schema: "exportName" }` for exports the kubb naming does not match).
Both paths are relative to kubb's `output.path`. The `input` must be a local OpenAPI JSON file.
With the per-schema layout, each wrapped schema is imported from its own file (`./zod/signupSchema`)
and everything else is re-exported from `./zod/index`; this example sets `output.path` to one
`schemas.ts` file instead.

```
pnpm -C js build        # once: this example imports validonce/kubb from the workspace build
pnpm generate           # writes src/gen (committed)
pnpm test
```
