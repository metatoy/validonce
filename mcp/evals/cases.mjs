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

// ---- The 0.5 stacks ----
const CONTACT_PROPERTIES = {
  ...Object.fromEntries(["email", "phone", "street", "city", "postalCode"].map((f) => [f, { type: ["string", "null"] }])),
  country: { type: "string", enum: ["US", "CA", "GB", "other"] },
  availableFrom: { type: ["string", "null"], format: "date" }, availableTo: { type: ["string", "null"], format: "date" },
};
const CONTACT_BASE = { country: "CA" };
const contactWellFormed = (d) =>
  ["US", "CA", "GB", "other"].includes(d.country) &&
  ["email", "phone", "street", "city", "postalCode"].every((f) => d[f] == null || typeof d[f] === "string") &&
  ["availableFrom", "availableTo"].every((f) => d[f] == null || (typeof d[f] === "string" && realDate(d[f])));
const SIGNUP = { base: SIGNUP_BASE, properties: SIGNUP_PROPERTIES, wellFormed: signupWellFormed };
const CONTACT = { base: CONTACT_BASE, properties: CONTACT_PROPERTIES, wellFormed: contactWellFormed };

// Calls the route registered on a fake Express app: what the route answers is what the project enforces.
const EXPRESS_WRAPPER = `import { mountSignups } from "./routes.mjs";
let chain = [];
const add = (_path, ...h) => { chain = h.flat(); };
mountSignups({ post: add, route: () => ({ post: (...h) => add("", ...h) }), use() {} });
export const Target = {
  async validate(input) {
    let status = 200, body;
    const res = { status(s) { status = s; return res; }, type() { return res; }, set() { return res; }, header() { return res; }, setHeader() {}, json(b) { body = b; return res; }, send(b) { body = b; return res; }, end() { return res; }, sendStatus(s) { status = s; return res; } };
    const req = { body: structuredClone(input), headers: {} };
    for (const h of chain) {
      let next = false, err;
      await h(req, res, (e) => { next = true; err = e; });
      if (err) throw err;
      if (!next) break;
    }
    if (status >= 500) throw new Error("status " + status);
    if (status < 400) return input;
    const list = Array.isArray(body?.errors) ? body.errors : [];
    throw Object.assign(new Error("invalid"), { name: "ValidationError", inner: list.map((e) => ({ path: String(e.field ?? "") })) });
  },
};
`;
// The form schema, whatever kind it is after the migration: yup, Zod, or a VeeValidate typed schema.
const SCHEMA_WRAPPER = (file, name) => `import * as m from ${JSON.stringify(`./${file}`)};
const s = m[${JSON.stringify(name)}] ?? m.schema ?? m.default ?? Object.values(m).find((x) => x && (x["~standard"] || x.parse || x.validate));
const fail = (paths) => { throw Object.assign(new Error("invalid"), { name: "ValidationError", inner: paths.map((path) => ({ path })) }); };
export const Target = {
  async validate(input) {
    if (s.__type === "VVTypedSchema") { const r = await s.parse(input); if (r.errors.length) fail(r.errors.map((e) => e.path ?? "")); return input; }
    if (typeof s.safeParse === "function") { const r = s.safeParse(input); if (!r.success) fail(r.error.issues.map((i) => String(i.path[0] ?? ""))); return input; }
    return s.validate(input, { abortEarly: false });
  },
};
`;
const importCheck = (entry) => ({ cmd: "node", args: ["-e", `import(${JSON.stringify(`./${entry}`)}).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })`] });
// NestJS: bundle with esbuild (decorators; node_modules left external) and load it.
const nestCheck = (entry) => ({ cmd: "node", args: ["-e", `const fs = require("fs"), out = process.cwd() + "/zz-load.mjs"; require("esbuild").build({ entryPoints: [${JSON.stringify(entry)}], bundle: true, packages: "external", format: "esm", platform: "node", outfile: out, logLevel: "error", tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } } }).then(() => import("reflect-metadata")).then(() => import(out)).then(() => 0, (e) => { console.error(e); return 1; }).then((code) => { fs.rmSync(out, { force: true }); process.exit(code); })`] });
const vueCheck = { cmd: "node", args: ["-e", `const { parse, compileScript } = require("vue/compiler-sfc"); const { descriptor, errors } = parse(require("fs").readFileSync("ContactForm.vue", "utf8")); if (errors.length) throw errors[0]; compileScript(descriptor, { id: "x", inlineTemplate: true }); import("./contact.schema.mjs").then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })`] };

Object.assign(CASES, {
  "go-playground": { dir: "stacks/go-playground", group: "stacks", stack: "go", runner: { script: "go-project" }, build: {}, export: { kind: "go" }, ...SIGNUP },
  "spring-jakarta": {
    dir: "stacks/spring-jakarta", group: "stacks", stack: "java", build: {}, export: { kind: "java", model: "example.signup.Signup" }, ...SIGNUP,
    runner: { script: "java-project", model: "example.signup.Signup", pathMap: { endAfterStart: "end" } },
  },
  nestjs: {
    dir: "stacks/nestjs", group: "stacks", stack: "js", deps: ["@nestjs/common", "@nestjs/core", "@nestjs/swagger", "class-transformer", "class-validator", "reflect-metadata", "rxjs"],
    runner: { script: "run-js.mjs", kind: "class-validator", entry: "contact.dto.ts", exportName: "Contact" }, build: nestCheck("contacts.controller.ts"), ...CONTACT,
  },
  "express-joi": {
    dir: "stacks/express-joi", group: "stacks", stack: "js", deps: ["joi"],
    runner: { script: "run-js.mjs", kind: "yup", wrapper: EXPRESS_WRAPPER, exportName: "Target" }, build: importCheck("routes.mjs"), ...SIGNUP,
    // Joi.date().iso() also takes datetimes and compares instants
    probes: [["2024-06-15T10:00:00Z", "2024-06-15T09:00:00Z"], ["2024-06-15T10:00:00Z", "2024-06-15T11:00:00Z"], ["2024-06-15", "2024-06-14T10:00:00Z"], ["2024", "2023"]].map(([start, end]) => ({ ...SIGNUP_BASE, start, end })),
  },
  "express-joi-text": {
    dir: "stacks/express-joi-text", group: "stacks", stack: "js", deps: ["joi"],
    runner: { script: "run-js.mjs", kind: "yup", wrapper: EXPRESS_WRAPPER, exportName: "Target" }, build: importCheck("routes.mjs"),
    base: { ...SIGNUP_BASE, confirmEmail: "a@example.test" },
    properties: { ...SIGNUP_PROPERTIES, confirmEmail: { type: "string", minLength: 1 } },
    wellFormed: (d) => signupWellFormed(d) && typeof d.confirmEmail === "string" && d.confirmEmail !== "",
    probes: [["2024-06-15T10:00:00Z", "2024-06-15T09:00:00Z"], ["2024-06-15", "2024-06-14T10:00:00Z"], ["2024", "2023"], ["2024-02-31", "2024-02-30"]].map(([start, end]) => ({ ...SIGNUP_BASE, confirmEmail: "a@example.test", start, end })),
  },
  "vue-veevalidate": {
    dir: "stacks/vue-veevalidate", group: "stacks", stack: "js", deps: ["@vee-validate/yup", "vee-validate", "vue", "yup", "zod"],
    runner: { script: "run-js.mjs", kind: "yup", wrapper: SCHEMA_WRAPPER("contact.schema.mjs", "Contact"), exportName: "Target" }, build: vueCheck, ...CONTACT,
  },
  kubernetes: {
    dir: "stacks/kubernetes", group: "stacks", stack: "none", runner: { script: "oracle", module: "kubernetes.mjs" },
    build: { none: "nothing to build; the CRD must be unchanged (scope)" },
    base: { tier: "standard" },
    properties: {
      tier: { type: "string", enum: ["standard", "premium"] }, contact: { type: "string", minLength: 1 }, email: { type: "string", minLength: 1 }, phone: { type: "string", minLength: 1 },
      from: { type: "string", format: "date" }, to: { type: "string", format: "date" }, minGuests: { type: "integer" }, maxGuests: { type: "integer" },
    },
    // what the CRD's schema admits: minLength 1 text, real dates, int32 integers
    wellFormed: (d) =>
      ["standard", "premium"].includes(d.tier) &&
      ["contact", "email", "phone"].every((f) => d[f] === undefined || (typeof d[f] === "string" && d[f] !== "")) &&
      ["from", "to"].every((f) => d[f] === undefined || (typeof d[f] === "string" && realDate(d[f]))) &&
      ["minGuests", "maxGuests"].every((f) => d[f] === undefined || (Number.isInteger(d[f]) && d[f] >= 0 && d[f] < 2 ** 31)),
  },
  "tricky-go-arithmetic": { dir: "tricky/arithmetic-go", group: "tricky", stack: "go", build: {} },
  "tricky-jakarta-db": { dir: "tricky/db-jakarta", group: "tricky", stack: "java", build: {} },
  "tricky-joi-coercion": { dir: "tricky/coercion-joi", group: "tricky", stack: "js", deps: ["joi"], build: importCheck("reservation.mjs") },
  "tricky-nestjs-format": { dir: "tricky/format-nestjs", group: "tricky", stack: "js", deps: ["class-transformer", "class-validator", "reflect-metadata"], build: nestCheck("address.dto.ts") },
});

// The same fixtures with the date format enforced at runtime. A validonce date compare skips malformed text, so where
// nothing enforces the format (yup, angular, nestjs above) a migration accepts malformed dates the original rejected.
// The Joi one is express-joi-text. The earlier fixtures and their scores stay as they are.
const DATE_PAIRS = [["2024-06-15T10:00:00Z", "2024-06-15T09:00:00Z"], ["2024-06-15", "2024-06-14T10:00:00Z"], ["2024", "2023"], ["2024-02-31", "2024-02-30"], ["zzz", "aaa"], ["2024-06-15", "!!"]];
const signupProbes = DATE_PAIRS.map(([start, end]) => ({ ...SIGNUP_BASE, start, end }));
Object.assign(CASES, {
  "yup-dates": { ...CASES.yup, dir: "stacks/yup-dates", group: "stacks", probes: signupProbes },
  "angular-dates": { ...CASES.angular, dir: "stacks/angular-dates", group: "stacks", probes: signupProbes },
  "nestjs-dates": { ...CASES.nestjs, dir: "stacks/nestjs-dates", probes: DATE_PAIRS.map(([availableFrom, availableTo]) => ({ ...CONTACT_BASE, email: "a@example.test", availableFrom, availableTo })) },
});

// Hold-out cases: public apps measured once, kept OUTSIDE this repo (third-party code, scratch copies).
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
