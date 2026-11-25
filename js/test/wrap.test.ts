// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { main } from "../src/cli";
import { camel, pascal } from "../src/wrap";

const here = (p: string) => new URL(p, import.meta.url).pathname;
const golden = (n: string) =>
  here(`../../conformance/golden/${n}.openapi.json`);
const fixture = (n: string) => here(`./fixtures/wrap/${n}.zod.ts.txt`);

function run(argv: string[]) {
  let out = "";
  let err = "";
  const code = main(argv, { out: (s) => (out += s), err: (s) => (err += s) });
  return { code, out, err };
}

const dir = mkdtempSync(join(tmpdir(), "validonce-wrap-"));
let n = 0;
/** Writes a modified copy of the fastapi golden document and returns its path. */
// biome-ignore lint/suspicious/noExplicitAny: test edits an arbitrary JSON document
type Doc = any;
function doc(edit: (d: Doc) => void): string {
  const d: Doc = JSON.parse(readFileSync(golden("fastapi"), "utf8"));
  edit(d);
  const f = join(dir, `doc${n++}.json`);
  writeFileSync(f, JSON.stringify(d));
  return f;
}
function zod(text: string): string {
  const f = join(dir, `zod${n++}.ts`);
  writeFileSync(f, text);
  return f;
}
function wrap(openapi: string, zodFile: string, ...extra: string[]) {
  const o = join(dir, `out${n++}.ts`);
  const r = run([
    "wrap",
    "--openapi",
    openapi,
    "--zod",
    zodFile,
    "-o",
    o,
    ...extra,
  ]);
  let text: string | undefined;
  try {
    text = readFileSync(o, "utf8");
  } catch {
    text = undefined;
  }
  return { ...r, text };
}

describe("names", () => {
  test("pascal and camel", () => {
    expect(pascal("Signup-Input")).toBe("SignupInput");
    expect(camel("Signup-Input")).toBe("signupInput");
    expect(pascal("my_thing")).toBe("MyThing");
    expect(camel("Signup")).toBe("signup");
  });
});

describe("wrap matching on real generator output", () => {
  test.each([
    ["orval", "fastapi", "Signup"],
    ["kubb", "fastapi", "signupSchema"],
    ["orval", "signup-input", "SignupInput"],
    ["kubb", "signup-input", "signupInputSchema"],
  ])("%s / %s wraps %s", (tool, spec, exp) => {
    // signup-input: the FastAPI golden with Signup renamed Signup-Input (what FastAPI emits for a model used both ways)
    const openapi =
      spec === "fastapi"
        ? golden("fastapi")
        : doc((d) => {
            d.components.schemas["Signup-Input"] = d.components.schemas.Signup;
            delete d.components.schemas.Signup;
          });
    const r = wrap(openapi, fixture(`${tool}-${spec}`));
    expect(r.code).toBe(0);
    expect(r.text).toContain(
      `export const ${exp} = _withRules(_gen.${exp}, _rules["Signup"]);`,
    );
    expect(r.text).toContain("import * as _gen from");
    expect(r.text?.startsWith("// SPDX-License-Identifier: Apache-2.0\n")).toBe(
      true,
    );
  });

  test("hey-api style matches z{Name}, in auto and explicit", () => {
    for (const extra of [[], ["--style", "hey-api"]]) {
      const r = wrap(golden("fastapi"), fixture("hey-api-fastapi"), ...extra);
      expect(r.code).toBe(0);
      expect(r.text).toContain(
        'export const zSignup = _withRules(_gen.zSignup, _rules["Signup"]);',
      );
    }
    const bad = wrap(
      golden("fastapi"),
      fixture("hey-api-fastapi"),
      "--style",
      "kubb",
    );
    expect(bad.code).toBe(1);
    expect(bad.err).toContain("no matching export");
  });

  test("--style restricts matching", () => {
    const r = wrap(
      golden("fastapi"),
      fixture("kubb-fastapi"),
      "--style",
      "orval",
    );
    expect(r.code).toBe(1);
    expect(r.err).toContain('schema "Signup" has rules but no matching export');
  });

  test("the alias warning names per-operation exports", () => {
    const r = wrap(golden("fastapi"), fixture("orval-fastapi"));
    expect(r.err).toContain("CreateSignupSignupsPostBody");
    expect(r.err).toContain("stay unwrapped");
  });

  test("output is deterministic", () => {
    const a = wrap(golden("fastapi"), fixture("orval-fastapi")).text;
    const b = wrap(golden("fastapi"), fixture("orval-fastapi")).text;
    expect(a).toBe(b);
  });
});

describe("wrap fails at generation time (exit 1, nothing written)", () => {
  test("unknown field", () => {
    const openapi = doc((d) => {
      delete d.components.schemas.Signup.properties.end;
    });
    const r = wrap(openapi, fixture("orval-fastapi"));
    expect(r.code).toBe(1);
    expect(r.text).toBeUndefined();
    expect(r.err).toContain(
      'rule "Signup.compare.end" refers to field "end", which is not in the properties of schema "Signup"',
    );
  });

  test("ambiguous match", () => {
    const r = wrap(
      golden("fastapi"),
      zod("export const Signup = 1;\nexport const signupSchema = 2;\n"),
    );
    expect(r.code).toBe(1);
    expect(r.text).toBeUndefined();
    expect(r.err).toContain('schema "Signup" matches more than one export in');
    expect(r.err).toContain("Signup, signupSchema");
  });

  test("unmatched schema, and --map fixes it", () => {
    const z = zod(
      "export const CreateSignupBody = zod.object({});\nexport const Other = 1;\n",
    );
    const r = wrap(golden("fastapi"), z);
    expect(r.code).toBe(1);
    expect(r.text).toBeUndefined();
    expect(r.err).toContain(
      'schema "Signup" has rules but no matching export in',
    );
    expect(r.err).toContain("--map Signup=<export>");
    const ok = wrap(golden("fastapi"), z, "--map", "Signup=CreateSignupBody");
    expect(ok.code).toBe(0);
    expect(ok.text).toContain(
      "export const CreateSignupBody = _withRules(_gen.CreateSignupBody",
    );
  });

  test("--map to a missing export or an unknown schema", () => {
    const z = zod("export const Signup = 1;\n");
    const a = wrap(golden("fastapi"), z, "--map", "Signup=Nope");
    expect(a.code).toBe(1);
    expect(a.err).toContain('has no "export const Nope"');
    const b = wrap(golden("fastapi"), z, "--map", "Ghost=Signup");
    expect(b.code).toBe(1);
    expect(b.err).toContain('no schema "Ghost" with x-validonce');
  });

  test("usage errors exit 2", () => {
    expect(run(["wrap"]).code).toBe(2);
    expect(
      run([
        "wrap",
        "--openapi",
        "x",
        "--zod",
        "y",
        "-o",
        "z",
        "--style",
        "bogus",
      ]).code,
    ).toBe(2);
    expect(
      run(["wrap", "--openapi", "x", "--zod", "y", "-o", "z", "--map", "nope"])
        .code,
    ).toBe(2);
  });
});

describe("skips and warnings", () => {
  test("intersection (allOf) schema is skipped with a warning", () => {
    const openapi = doc((d) => {
      d.components.schemas.Extra = {
        allOf: [{ $ref: "#/components/schemas/Signup" }],
        "x-validonce": d.components.schemas.Signup["x-validonce"],
      };
    });
    const r = wrap(openapi, fixture("orval-fastapi"));
    expect(r.code).toBe(0);
    expect(r.err).toContain('skipping "Extra"');
    expect(r.text).not.toContain("Extra");
  });

  test("rules on a nested component schema warn", () => {
    const openapi = doc((d) => {
      d.components.schemas.Wrapper = {
        type: "object",
        properties: { signup: { $ref: "#/components/schemas/Signup" } },
      };
    });
    const r = wrap(openapi, fixture("orval-fastapi"));
    expect(r.code).toBe(0);
    expect(r.err).toContain('"Signup" has rules but is nested inside Wrapper');
  });
});
