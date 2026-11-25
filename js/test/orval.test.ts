// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Options } from "orval";
import { describe, expect, test, vi } from "vitest";
import { createValidonce, withValidonce } from "../src/orval";

const here = (p: string) => new URL(p, import.meta.url).pathname;
const golden = here("../../conformance/golden/aspnet.openapi.json");
const doc = JSON.parse(readFileSync(golden, "utf8"));
const ZOD = "export const Signup = z.object({});\n";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "validonce-orval-"));
  writeFileSync(join(dir, "schemas.ts"), ZOD);
  return dir;
}
const project = (dir: string, extra: Partial<Options> = {}): Options => ({
  input: golden,
  output: { client: "zod", mode: "single", target: join(dir, "schemas.ts") },
  ...extra,
});
async function resolved(c: Record<string, unknown>, k = "p"): Promise<Options> {
  return (await c[k]) as Options;
}
type Fn = (...a: unknown[]) => unknown;
const hooks = (o: Options) => o.hooks?.afterAllFilesWrite as unknown[];

describe("withValidonce", () => {
  test("adds a function hook and a transformer, keeps the rest", async () => {
    const dir = setup();
    const out = await resolved(withValidonce({ p: project(dir) }));
    expect(hooks(out)).toHaveLength(1);
    expect(typeof hooks(out)[0]).toBe("function");
    const input = out.input as {
      target: string;
      override: { transformer: unknown };
    };
    expect(input.target).toBe(golden);
    expect(typeof input.override.transformer).toBe("function");
  });

  test("preserves and composes existing hooks (string, object, array) before ours", async () => {
    const dir = setup();
    const fn = vi.fn();
    for (const existing of [
      "echo hi",
      { command: "echo hi" },
      [fn, "echo hi"],
    ]) {
      const out = await resolved(
        withValidonce({
          p: project(dir, { hooks: { afterAllFilesWrite: existing } }),
        }),
      );
      const list = hooks(out);
      expect(list.length).toBe(Array.isArray(existing) ? 3 : 2);
      expect(list.slice(0, -1)).toEqual([existing].flat());
      expect(typeof list.at(-1)).toBe("function");
    }
  });

  test("composes an existing transformer function and captures its result", async () => {
    const dir = setup();
    const existing = vi.fn((s: unknown) => ({
      ...(s as object),
      tagged: true,
    }));
    const out = await resolved(
      withValidonce({
        p: project(dir, {
          input: {
            target: golden,
            override: { transformer: existing as never },
          },
        }),
      }),
    );
    const t = (out.input as { override: { transformer: Fn } }).override
      .transformer;
    expect(await t(doc)).toMatchObject({ tagged: true });
    expect(existing).toHaveBeenCalledOnce();
  });

  test("hook writes validonce.gen.ts next to the Zod module", async () => {
    const dir = setup();
    const out = await resolved(withValidonce({ p: project(dir) }));
    const t = (out.input as { override: { transformer: Fn } }).override
      .transformer;
    t(doc);
    await (hooks(out)[0] as Fn)([]);
    const text = readFileSync(join(dir, "validonce.gen.ts"), "utf8");
    expect(text).toContain('import * as _gen from "./schemas";');
    expect(text).toContain("export const Signup = _withRules(_gen.Signup");
    expect(text).toContain("rules.company_required");
  });

  test("falls back to reading a local input file when the transformer did not run", async () => {
    const dir = setup();
    const out = await resolved(
      withValidonce({ p: project(dir) }, { fileName: "rules.gen.ts" }),
    );
    await (hooks(out)[0] as Fn)([]);
    expect(readFileSync(join(dir, "rules.gen.ts"), "utf8")).toContain(
      "_withRules",
    );
  });

  test("zodFile option supports non-single modes; --map option works", async () => {
    const dir = setup();
    writeFileSync(
      join(dir, "schemas.ts"),
      "export const SignupSchema = z.object({});\n",
    );
    const out = await resolved(
      withValidonce(
        {
          p: project(dir, {
            output: { client: "zod", mode: "tags-split", target: dir },
          }),
        },
        { zodFile: join(dir, "schemas.ts"), map: { Signup: "SignupSchema" } },
      ),
    );
    await (hooks(out)[0] as Fn)([]);
    expect(readFileSync(join(dir, "validonce.gen.ts"), "utf8")).toContain(
      "export const SignupSchema = _withRules(_gen.SignupSchema",
    );
  });

  test("a failing hook sets exitCode and throws with the reason", async () => {
    const dir = setup();
    writeFileSync(join(dir, "schemas.ts"), "export const Other = 1;\n");
    const out = await resolved(withValidonce({ p: project(dir) }));
    const prev = process.exitCode;
    await expect((hooks(out)[0] as Fn)([])).rejects.toThrow(
      /no matching export/,
    );
    expect(process.exitCode).toBe(1);
    process.exitCode = prev;
  });

  test("fails clearly for Zod 3, mini, a non-zod client, and unmapped modes", () => {
    const dir = setup();
    const z = (zod: object) =>
      project(dir, {
        output: {
          client: "zod",
          target: join(dir, "schemas.ts"),
          override: { zod },
        } as never,
      });
    expect(withValidonce({ p: z({ version: 4 }) })).toBeDefined();
    const bad = async (p: Options) => resolved(withValidonce({ p }));
    return Promise.all([
      expect(bad(z({ version: 3 }))).rejects.toThrow(/Zod 4/),
      expect(bad(z({ variant: "mini" }))).rejects.toThrow(/mini/),
      expect(
        bad(project(dir, { output: { client: "axios", target: "x.ts" } })),
      ).rejects.toThrow(/client: "zod"/),
      expect(
        bad(
          project(dir, {
            output: { client: "zod", mode: "split", target: dir },
          }),
        ),
      ).rejects.toThrow(/zodFile/),
    ]);
  });

  test("passes logLevel and function projects through", async () => {
    const dir = setup();
    const c = withValidonce({
      logLevel: "error",
      p: () => project(dir),
    } as never) as Record<string, unknown>;
    expect(c.logLevel).toBe("error");
    expect(hooks(await (c.p as () => Promise<Options>)())).toHaveLength(1);
  });
});

describe("createValidonce", () => {
  test("pieces work standalone", async () => {
    const dir = setup();
    const v = createValidonce({ zodFile: join(dir, "schemas.ts") });
    expect(v.transformer(doc as never)).toBe(doc);
    await v.afterAllFilesWrite();
    expect(readFileSync(join(dir, "validonce.gen.ts"), "utf8")).toContain(
      "_withRules",
    );
  });
  test("no document captured and no fallback is an error", async () => {
    const dir = setup();
    await expect(
      createValidonce({
        zodFile: join(dir, "schemas.ts"),
      }).afterAllFilesWrite(),
    ).rejects.toThrow(/no OpenAPI document/);
  });
});
