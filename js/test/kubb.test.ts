// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { adapterOas } from "@kubb/adapter-oas";
import { pluginZod } from "@kubb/plugin-zod";
import { createKubb } from "kubb";
import { describe, expect, test } from "vitest";
import { pluginValidonce, writeCompanion } from "../src/kubb";

const golden = resolve(__dirname, "./fixtures/openapi/aspnet.openapi.json");

describe("pluginValidonce", () => {
  test("kubb run writes a companion wrapping signupSchema with the three rules", async () => {
    const out = mkdtempSync(join(tmpdir(), "validonce-kubb-"));
    const kubb = createKubb({
      root: ".",
      input: golden,
      adapter: adapterOas(),
      output: { path: out, clean: true },
      plugins: [
        pluginZod({ output: { path: "./schemas.ts" } }),
        pluginValidonce(),
      ],
    });
    await kubb.build();
    const text = readFileSync(join(out, "validonce.gen.ts"), "utf8");
    expect(text).toContain(
      "export const signupSchema = _withRules(_gen.signupSchema",
    );
    expect(text).toContain('from "./schemas"');
    for (const id of ["company_required", "end_after_start", "quantity_min"])
      expect(text).toContain(id);
  });

  test("default per-schema layout: imports each wrapped schema from its own file", async () => {
    const out = mkdtempSync(join(tmpdir(), "validonce-kubb-"));
    const kubb = createKubb({
      root: ".",
      input: golden,
      adapter: adapterOas(),
      output: { path: out, clean: true },
      plugins: [pluginZod(), pluginValidonce()],
    });
    await kubb.build();
    const text = readFileSync(join(out, "validonce.gen.ts"), "utf8");
    expect(text).toContain('import * as _src0 from "./zod/signupSchema";');
    expect(text).toContain(
      "export const signupSchema = _withRules(_src0.signupSchema",
    );
    expect(text).toContain('export * from "./zod/index";');
    expect(text).not.toContain("_gen");
    expect(text).toContain("company_required");
  });

  test("a missing zod file names the fix", () => {
    const dir = mkdtempSync(join(tmpdir(), "validonce-kubb-"));
    expect(() =>
      writeCompanion({
        openapi: golden,
        zodFile: join(dir, "nope.ts"),
        outFile: join(dir, "validonce.gen.ts"),
      }),
    ).toThrow(/after pluginZod/);
  });

  test("an unmatched schema fails with the schema name", () => {
    const dir = mkdtempSync(join(tmpdir(), "validonce-kubb-"));
    writeFileSync(join(dir, "schemas.ts"), "export const other = 1;\n");
    expect(() =>
      writeCompanion({
        openapi: golden,
        zodFile: join(dir, "schemas.ts"),
        outFile: join(dir, "validonce.gen.ts"),
      }),
    ).toThrow(/Signup/);
  });
});
