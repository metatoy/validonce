// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluate, type Issue, type Rule } from "../src/index";

interface Case {
  id: string;
  description: string;
  rules: Rule[];
  data: Record<string, unknown>;
  expect: Issue[];
}

function findRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, "conformance", "rules"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("conformance/rules not found");
    dir = parent;
  }
}

const rulesDir = join(findRoot(), "conformance", "rules");
const cases: Case[] = readdirSync(rulesDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .flatMap(
    (f) =>
      (JSON.parse(readFileSync(join(rulesDir, f), "utf8")) as { cases: Case[] })
        .cases,
  );

it("loads exactly 95 cases", () => {
  expect(cases.length).toBe(95);
});

describe.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
  it("server", () => {
    expect(evaluate(c.rules, c.data, { side: "server" })).toEqual(c.expect);
  });
  it("client", () => {
    const serverOnly = new Set(
      c.rules.filter((r) => r.server_only === true).map((r) => r.id),
    );
    const expected = c.expect.filter((i) => !serverOnly.has(i.ruleId));
    expect(evaluate(c.rules, c.data, { side: "client" })).toEqual(expected);
  });
});
