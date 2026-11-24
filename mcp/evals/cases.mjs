// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

// The test set: five "before" fixtures (the Signup rules, hand-written) and five "tricky" fixtures
// (the agent must NOT migrate anything). Eval mechanics live here; the answers live in each
// fixture's expected.json (which is never copied to the agent's working directory).

// JSON Schema properties of the Signup wire model (dates are format: date), given to generate_inputs.
const SIGNUP_PROPERTIES = {
  // same as testbeds/before/{zod,yup,angular}/openapi.json (nullable fields allow null, so null blanks are generated)
  plan: { type: "string", enum: ["free", "pro"] }, company: { type: ["string", "null"] }, email: { type: "string", minLength: 1 },
  start: { type: "string", format: "date" }, end: { type: ["string", "null"], format: "date" }, quantity: { type: "integer" },
};
const SIGNUP_BASE = { plan: "free", email: "a@example.test", start: "2026-05-10", quantity: 1 };
// The old validators also enforce checks that are not migrated (required plan/email/start/quantity).
// Inputs that trip those would show as divergences that are not the migration's fault, so the
// differential keeps only well-formed inputs.
const realDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1) return false;
  const t = new Date(0);
  t.setUTCFullYear(y, mo - 1, d);
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
};
const signupWellFormed = (d) =>
  (d.plan === "free" || d.plan === "pro") &&
  typeof d.email === "string" && d.email !== "" &&
  typeof d.start === "string" && realDate(d.start) &&
  typeof d.quantity === "number" && Number.isInteger(d.quantity) &&
  (d.end == null || (typeof d.end === "string" && realDate(d.end))) &&
  (d.company == null || typeof d.company === "string");

// Angular's partially compiled packages need the JIT compiler loaded first (run-js.mjs does the same).
const loadCheck = (kind) =>
  (kind === "angular" ? "import('@angular/compiler').then(() => import('./signup.mjs'))" : "import('./signup.mjs')") +
  ".then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })";
const JS_BEFORE = (kind, exportName) => ({
  group: "before",
  stack: "js",
  runner: { script: "run-js.mjs", kind, entry: "signup.mjs", exportName },
  build: { cmd: "node", args: ["-e", loadCheck(kind)] },
  base: SIGNUP_BASE,
  properties: SIGNUP_PROPERTIES,
  wellFormed: signupWellFormed,
});

export const CASES = {
  zod: { dir: "before/zod", ...JS_BEFORE("zod", "Signup") },
  yup: { dir: "before/yup", ...JS_BEFORE("yup", "Signup") },
  angular: { dir: "before/angular", ...JS_BEFORE("angular", "buildSignupGroup") },
  pydantic: {
    dir: "before/pydantic",
    group: "before",
    stack: "python",
    runner: { script: "run-pydantic.py", module: "signup.py", className: "Signup" },
    build: { cmd: ".venv/bin/python", args: ["-c", "import signup"] },
    export: { kind: "python", module: "signup", className: "Signup" },
    base: SIGNUP_BASE,
    properties: SIGNUP_PROPERTIES,
  properties: SIGNUP_PROPERTIES,
    wellFormed: signupWellFormed,
  },
  fluentvalidation: {
    dir: "before/fluentvalidation",
    group: "before",
    stack: "dotnet",
    runner: { script: "dotnet-runner", assembly: "Before.Fluent.dll", validator: "Before.SignupValidator", model: "Before.Signup" },
    build: { cmd: "dotnet", args: ["build", "-c", "Release", "-v", "q", "-nologo"] },
    export: { kind: "dotnet", assembly: "Before.Fluent.dll", validator: "Before.SignupValidator" },
    base: SIGNUP_BASE,
    properties: SIGNUP_PROPERTIES,
  properties: SIGNUP_PROPERTIES,
    wellFormed: signupWellFormed,
  },
  "tricky-arithmetic": {
    dir: "tricky/arithmetic-ts", group: "tricky", stack: "js",
    build: { cmd: "node", args: ["--experimental-strip-types", "-e", "import('./order.ts').then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })"] },
  },
  "tricky-nested": {
    dir: "tricky/nested-ts", group: "tricky", stack: "js",
    build: { cmd: "node", args: ["--experimental-strip-types", "-e", "import('./checkout.ts').then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })"] },
  },
  "tricky-coercion": {
    dir: "tricky/coercion-py", group: "tricky", stack: "python",
    build: { cmd: ".venv/bin/python", args: ["-c", "import models"] },
  },
  "tricky-conditional-format": {
    dir: "tricky/conditional-format-py", group: "tricky", stack: "python",
    build: { cmd: ".venv/bin/python", args: ["-c", "import address"] },
  },
  "tricky-async-db": {
    dir: "tricky/async-db-cs", group: "tricky", stack: "dotnet",
    build: { cmd: "dotnet", args: ["build", "-c", "Release", "-v", "q", "-nologo"] },
  },
};

// Hold-out cases (Plan C Part 5): public apps measured once, kept OUTSIDE this repo (third-party code, scratch copies).
// VALIDONCE_HOLDOUT_CASES points at a module exporting HOLDOUT: { [id]: case } where each case has an absolute
// `root` (its fixture folder, holding expected.json) and group "holdout". They run with VALIDONCE_EVAL_GROUP=holdout.
if (process.env.VALIDONCE_HOLDOUT_CASES) {
  const { HOLDOUT } = await import(pathToFileURL(process.env.VALIDONCE_HOLDOUT_CASES).href);
  for (const [id, c] of Object.entries(HOLDOUT)) {
    if (CASES[id]) throw new Error(`hold-out case id clashes with a tuning case: ${id}`);
    if (!c.root || !isAbsolute(c.root)) throw new Error(`hold-out case ${id} needs an absolute root`);
    CASES[id] = { group: "holdout", ...c, dir: "." };
  }
}

/** The fixture folder of a case: testbeds/<dir>, or an absolute root for a hold-out case. */
export const caseDir = (c, testbeds) => (c.root ? c.root : join(testbeds, c.dir));

/** The promptfoo test description of a case (tests.mjs builds them; score-vscode.mjs selects by them). */
export const caseDescription = (id, c = CASES[id]) => (c.root ? `holdout/${id}` : c.dir);

export const AGENTS = ["claude", "copilot"];
export const REPEATS = 3;
