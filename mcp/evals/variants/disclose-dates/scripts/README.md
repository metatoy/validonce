<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Metatoy LLC -->
# Old-validator runners

Five runners execute the user's **existing** validators over wire-JSON inputs so the migration
can be diffed against validonce (`compare_results`). Run them from a scratch directory, with the
user's consent, never against production data. Every runner prints a header line on stderr
(`validonce-runner: ...`) recording the runner, versions, sandbox flags and environment; paste it
into the migration report.

All of them share one contract. Input: a JSONL file, one wire-JSON object per line. Output: a JSONL
file, one line per input:

```json
{"accept": true, "paths": [], "error": "only when the validator itself failed"}
```

`paths` are the **top-level wire field names** with errors (`__root__` for an error with no
field). A validator that throws is reported with `error` and is never counted as a rejection.
Exit codes: `2` usage, `3` cannot load / bundle / run, `4` (C# only) cannot prove.

| Runner | Sources | Command |
|---|---|---|
| `run-js.mjs` | Zod, yup, Angular group validators, class-validator, Joi | `node run-js.mjs <entry-module> <exportName> <inputs> <out> [--kind zod\|yup\|angular\|class-validator\|joi]` |
| `run-pydantic.py` | Pydantic v2 models | `env -i PATH=/usr/bin:/bin <venv>/bin/python -I run-pydantic.py <module.py> <Class> <inputs> <out>` |
| `run-go/` | go-playground/validator | `cp -R run-go "$SCRATCH/go" && cp <your model.go> "$SCRATCH/go/" && (cd "$SCRATCH/go" && go run . <inputs> <out>)` |
| `java-runner/` | Jakarta Bean Validation (Hibernate Validator) | `gradle -q libs && javac -cp "libs/*" -d classes <Model.java> && java -cp "libs/*:classes" Runner.java <ModelClass> <inputs> <out>` |
| `dotnet-runner/` | FluentValidation `AbstractValidator<T>` | `dotnet run --project dotnet-runner -- --assembly <dll> --validator <type> --model <type> --inputs <in> --out <out> [--naming camel\|none]` |

## `run-js.mjs` (Zod, yup, Angular)

Bundles the user's schema module with esbuild into one file in a scratch directory, then runs it in
a child `node --permission --allow-fs-read=<bundle>` (Node 22+): no file writes, no child
processes, no workers, empty environment. `esbuild` must be resolvable (the project has it, or
`npm i esbuild` in the scratch directory).

- Every import other than `zod`, `yup`, `@angular/*`, `rxjs` and relative files, and every Node
  builtin, resolves to a stub that throws `validonce runner: <module> needs I/O; isolate the schema
  module` (exit 3). A schema module that reads files or opens connections on import fails this way;
  extract the schema into a small module and rerun.
- `--kind zod`: `exportName` is a schema; `paths` = first segment of each issue path.
  `--kind yup`: `validate(input, {abortEarly: false})`; first segment of each inner path.
  `--kind angular`: `exportName` is a **factory** returning a fresh `FormGroup` with controls and
  group validator attached; the runner sets each control from the input, validates, and reports
  controls with errors (`__root__` if only the group has errors).
- Network: Node 22 has no network switch; `fetch`/`WebSocket`/`XMLHttpRequest` are removed as a
  tripwire only. For a real block run the whole command under
  `sandbox-exec -p '(version 1)(allow default)(deny network*)'` (macOS) or `unshare -n` (Linux).

- `--kind class-validator`: `exportName` is a **decorated class** (class-validator, optionally class-transformer). The runner does `plainToInstance(Class, input)` then `validate(instance)`; `paths` = each error's `property` (the TypeScript property name, so an `@Expose({ name })` rename is not mapped: see `references/class-validator.md`). The module is bundled with `experimentalDecorators`; there is no decorator metadata, so a DTO that needs `emitDecoratorMetadata` must state its types explicitly. Allowed imports add `class-validator`, `class-transformer`, `reflect-metadata`.
- `--kind joi`: `exportName` is a Joi schema; `validate(input, { abortEarly: false })`; `paths` = first segment of each `details[].path`. Joi's defaults apply (type conversion on, unknown keys rejected, so list every wire field). `joi` joins the allowed imports; the two pure builtins `url` and `util` are allowed from inside `node_modules` (Joi needs them, neither does I/O).

## `run-go/` (go-playground/validator)

A small Go program (module `validonce-runner`, one dependency: `go-playground/validator/v10`). Copy the directory to a scratch directory, replace **`model.go`** with the user's struct (with its `json` tags) and its `RegisterStructValidation` calls, `go mod tidy`, then `go run . <inputs> <out>` (or `go build` and run the binary under `sandbox-exec`/`unshare -n`: it opens no connections, but the user's validators are their code). `model.go` provides `newModel() any` (a pointer to the struct) and `register(v *validator.Validate)`. Keep only the migrated cross-field checks: field tags such as `required` or `oneof` would show as divergences.

- `paths` are `fe.Field()`, with a tag-name function reading the `json` tag, so they are wire names; `sl.ReportError(v, "wireName", "GoName", ...)` names the wire field directly. An error with no field is `__root__`.
- A line that does not decode into the struct is `{"error": "parse: ..."}`; a validator that panics is `{"error": "panic: ..."}`. Neither is a rejection.
- Value fields (`string`) make `null`, missing and `""` the same zero value; pointer fields keep them apart. Use whichever the old code used.

## `java-runner/` (Jakarta Validation)

One file, `Runner.java`, launched from source with JDK 21: `java -cp "libs/*:classes" Runner.java <fully.qualified.Model> <inputs> <out>`. `build.gradle.kts` only resolves the libraries into `libs/` (`gradle -q libs`: Hibernate Validator 8, the Expressly EL implementation, Jackson); edit the versions to the user's. Compile the user's model and constraint classes into `classes/` (`javac -cp "libs/*" -d classes ...`). Each line is bound to the class with Jackson (unknown properties ignored; add the Kotlin or parameter-names module for records and data classes), then validated with the default `Validator`.

- The first node of each violation's property path is mapped from the Java property to its wire name through Jackson's introspection (`@JsonProperty`, naming strategies). A class-level violation with no property node is `__root__`; an `@AssertTrue` method reports its own name (`endAfterStart`), which is not a wire field.
- A line that does not bind is `{"error": "parse: ..."}`; a `ConstraintValidator` that throws is `{"error": ...}`. A validator that needs injected beans cannot be built by the plain `Validator`: report "cannot prove" rather than mocking it.
- Offline and read-only, like the others; run it under `sandbox-exec`/`unshare -n` for a real network block. Stop the Gradle daemon afterwards (`gradle --stop`) or use `--no-daemon`.

## `run-pydantic.py`

Runs in the **project's own venv** with `python -I` (no user site-packages, no `PYTHON*` variables,
no current-directory imports) under `env -i` (no tokens, no `DATABASE_URL`). Sockets and DNS are
replaced before the module is imported, so a module that connects on import fails with
`validonce runner: <module> needs I/O; isolate the schema module` (exit 3). Import only the model
module; if it pulls in the app, copy the class into a scratch file and say so in the report.
`paths` come from `loc[0]`, else `ctx["field"]`, else `ctx["error"].field`, else `__root__`. The
network guard is a tripwire; use `sandbox-exec`/`unshare -n` for a real block.

## `dotnet-runner/` (FluentValidation)

A template console project (net10.0, no package references: FluentValidation is reached by
reflection from the user's own assembly, so whatever version the user has is the version tested).
Build the user's project first, then run the template against the built dll. For the sandbox, build
the runner once and run the dll with a scrubbed environment and no network:

```sh
dotnet build dotnet-runner -c Release -o "$SCRATCH/runner"
env -i PATH="$(dirname "$(which dotnet)"):/usr/bin:/bin" DOTNET_ROOT="$DOTNET_ROOT" \
  sandbox-exec -p '(version 1)(allow default)(deny network*)' \
  dotnet "$SCRATCH/runner/DotnetRunner.dll" --assembly bin/Release/net10.0/App.dll \
    --validator App.SignupValidator --model App.Signup --inputs in.jsonl --out out.jsonl
```

(`unshare -n` instead of `sandbox-exec` on Linux.) The runner itself does not block the network or
scrub anything; it prints `env: scrubbed? yes|no` (yes when the process has at most 5 variables) so
the report shows what was used.

- The assembly is loaded in a separate `AssemblyLoadContext` that resolves dependencies from the
  dll's own directory (`*.deps.json`, else side-by-side dlls). The user's build must have copied
  its dependencies there (`CopyLocalLockFileAssemblies` for class libraries).
- Each line is deserialized with `System.Text.Json` and `JsonSerializerDefaults.Web` (camelCase,
  case-insensitive, as ASP.NET does). `--naming none` turns the camelCase policy off. A line that
  does not deserialize is `{"accept": false, "paths": [], "error": "parse: ..."}`: a separate class
  of result, not a rule rejection.
- `PropertyName` is mapped to the wire name through the same System.Text.Json metadata
  (`[JsonPropertyName]` wins, then the naming policy), first segment only.
- The validator is created with `Activator.CreateInstance`. One without a parameterless constructor
  (it needs injected services) exits **4** with
  `validonce runner: <type> needs constructor services; cannot prove`. Report it as "cannot prove";
  do not mock the services.

## Proof in CI

`testbeds/before/` holds a hand-written old validator for the **Signup** and **Contact** contracts (`examples/CONTRACT.md`) in each library: `go-playground/`, `jakarta/`, `class-validator/`, `joi/`, `yup/` (VeeValidate runs yup or Zod schemas, so the headless proof is the yup runner on the form-level Contact checks). `node check-sources.mjs` (CI job `runners`) generates the inputs with the MCP server's `generateInputs` (about 10,000 per contract), runs each fixture through its runner, and requires `compareResults` (the MCP `compare_results`) to PASS with **0 divergences**. The older `check.mjs` still covers zod, yup, angular, pydantic and FluentValidation on Signup.
