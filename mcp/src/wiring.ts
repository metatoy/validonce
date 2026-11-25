// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Deterministic client-wiring snippets, copied from docs/client-*.md and docs/client-codegen.md.
// No network, no file access: the same input always gives the same text.

export const FRONTENDS = ["react", "angular", "vue", "dom"] as const;
export const GENERATORS = ["kubb", "hey-api", "orval"] as const;
export type Frontend = (typeof FRONTENDS)[number];
export type Generator = (typeof GENERATORS)[number];

export interface Snippet {
  title: string;
  language: "ts" | "tsx" | "js" | "vue" | "sh";
  code: string;
}

export interface ClientWiring {
  frontend: Frontend;
  generator?: Generator;
  schemaName: string;
  /** The export the form should import for this schema, when a generator is named. */
  exportName?: string;
  install: string;
  snippets: Snippet[];
  notes: string[];
}

// The same word split and casing as wrap() in js/src/wrap.ts (pinned by a test).
function words(name: string): string[] {
  return name.split(/[^A-Za-z0-9]+/).filter(Boolean);
}
export function pascal(name: string): string {
  return words(name)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}
export function camel(name: string): string {
  const p = pascal(name);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** The names the kubb, Hey API and orval styles would export a schema under. */
export function generatorNames(schema: string): { kubb: string; "hey-api": string; orval: string } {
  return { kubb: `${camel(schema)}Schema`, "hey-api": `z${pascal(schema)}`, orval: pascal(schema) };
}

const GENERATOR_CONFIG: Record<Generator, (n: string) => Snippet[]> = {
  kubb: () => [
    {
      title: "kubb.config.ts",
      language: "ts",
      code: `import { pluginZod } from "@kubb/plugin-zod";
import { defineConfig } from "kubb/config";
import { pluginValidonce } from "validonce/kubb";

export default defineConfig({
  input: "./openapi.json",
  output: { path: "./src/gen" },
  plugins: [pluginZod(), pluginValidonce()], // after pluginZod
});`,
    },
  ],
  "hey-api": () => [
    {
      title: "openapi-ts.config.ts",
      language: "ts",
      code: `import { defineConfig } from "@hey-api/openapi-ts";
import { validonce } from "validonce/hey-api";

export default defineConfig({
  input: "./openapi.json",
  output: "src/gen",
  plugins: ["zod", validonce()],
});`,
    },
  ],
  orval: () => [
    {
      title: "orval.config.mjs",
      language: "js",
      code: `import { withValidonce } from "validonce/orval";

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
});`,
    },
  ],
};

const GEN_IMPORT: Record<Generator, string> = {
  kubb: "./gen/zod/signupSchema",
  "hey-api": "./gen/zod.gen",
  orval: "./gen/schemas",
};

function importChange(g: Generator, exportName: string): Snippet {
  const before = GEN_IMPORT[g];
  return {
    title: "Change one import in the form",
    language: "ts",
    code: `// before
import { ${exportName} } from "${before}";
// after: the same name, with the server's cross-field rules attached
import { ${exportName} } from "./gen/validonce.gen";`,
  };
}

const SERVER_ERRORS = (messagesArg: string): Snippet => ({
  title: "Show server 422 errors on the same fields",
  language: "ts",
  code: `import { fieldErrorsFromIssues, issuesFromResponse } from "validonce/server-errors";

if (!res.ok) {
  const body: unknown = await res.json().catch(() => null);
  const serverErrors = fieldErrorsFromIssues(issuesFromResponse(body), ${messagesArg}); // { company: "..." }
}`,
});

const LOAD_RULES = (schema: string): Snippet => ({
  title: "Load the rules from the OpenAPI document",
  language: "ts",
  code: `import { rulesFromOpenApi } from "validonce/openapi";

const doc: unknown = await (await fetch("/openapi.json")).json();
const rules = rulesFromOpenApi(doc, ${JSON.stringify(schema)})!;
// or at build time: npx validonce extract openapi.json -o src/rules.gen.ts`,
});

const MESSAGES = `const messages: Record<string, string> = {
  "rules.company_required": "Company is required on the Pro plan",
  "rules.end_after_start": "End date must be on or after the start date",
};`;

function runtime(frontend: Frontend, schema: string): Snippet[] {
  const base = `const baseSchema = z.object({ /* your field schema */ });`;
  switch (frontend) {
    case "react":
      return [
        {
          title: "withRules + react-hook-form",
          language: "tsx",
          code: `import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { withRules } from "validonce/zod";
import { z } from "zod";

${MESSAGES}
${base}
type FormValues = z.input<typeof baseSchema>;

const schema = useMemo(() => withRules(baseSchema, rules, { messages }), [rules]);
const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
  resolver: zodResolver(schema),
});`,
        },
        {
          title: "Dependent fields (re-check company when plan changes)",
          language: "tsx",
          code: `import { registerDeps } from "validonce/react-hook-form";

const deps = registerDeps(rules);
<select {...register("plan", { ...deps("plan") })} /> // re-checks "company"`,
        },
      ];
    case "angular":
      return [
        {
          title: "Signal Forms (no adapter)",
          language: "ts",
          code: `import { signal } from "@angular/core";
import { form, validateStandardSchema } from "@angular/forms/signals";
import { withRules } from "validonce/zod";
import { z } from "zod";

${MESSAGES}
${base}

const model = signal({ /* initial values */ });
const f = form(model, (path) =>
  validateStandardSchema(path, withRules(baseSchema, rules, { messages })),
);`,
        },
        {
          title: "Reactive Forms",
          language: "ts",
          code: `import { FormControl, FormGroup } from "@angular/forms";
import { validonceGroupValidator } from "validonce/angular";

const group = new FormGroup(
  { /* controls */ },
  { validators: validonceGroupValidator(rules, { messages }) },
);
// group.controls.company.errors -> { validonce: { ruleId, key, params, message } }`,
        },
      ];
    case "vue":
      return [
        {
          title: "withRules + VeeValidate",
          language: "vue",
          code: `<script setup lang="ts">
import { useForm } from "vee-validate";
import { toVeeSchema, watchDependents } from "validonce/vue";
import { withRules } from "validonce/zod";
import { z } from "zod";

${MESSAGES}
${base}
type FormValues = z.input<typeof baseSchema>;

const schema = withRules(baseSchema, props.rules, { messages });
const form = useForm<FormValues>({
  validationSchema: toVeeSchema(schema), // VeeValidate 5: validationSchema: schema
});
watchDependents(form, props.rules); // call once, after useForm
</script>`,
        },
      ];
    case "dom":
      return [
        {
          title: "attachRules on a plain form or web component",
          language: "ts",
          code: `import { attachRules } from "validonce/dom";

const messages = {
  "rules.company_required": "Company is required on the Pro plan",
  "rules.end_after_start": "End date must be on or after the start date",
};

const form = document.querySelector<HTMLFormElement>("#${schema.toLowerCase()}")!;
const { validate, applyServerErrors, detach } = attachRules(form, rules, { messages });`,
        },
      ];
  }
}

function serverErrors(frontend: Frontend): Snippet {
  if (frontend === "dom")
    return {
      title: "Show server 422 errors (same places as client errors)",
      language: "ts",
      code: `form.addEventListener("submit", async (e) => {
  if (e.defaultPrevented) return; // attachRules blocked an invalid submit
  e.preventDefault();
  const res = await fetch("/signups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(readForm(form)) });
  if (!res.ok) applyServerErrors(await res.json().catch(() => null));
});`,
    };
  return SERVER_ERRORS(frontend === "angular" || frontend === "vue" ? "messages, rules" : "messages");
}

const INSTALL: Record<Frontend, string> = {
  react: "pnpm add validonce zod react-hook-form @hookform/resolvers",
  angular: "pnpm add validonce zod",
  vue: "pnpm add validonce zod vee-validate",
  dom: "pnpm add validonce",
};

export function suggestClientWiring(input: {
  frontend: Frontend;
  generator?: Generator;
  schemaName?: string;
}): ClientWiring {
  const schemaName = input.schemaName ?? "Signup";
  const { frontend, generator } = input;
  const snippets: Snippet[] = [];
  const notes: string[] = [];
  let exportName: string | undefined;

  if (generator !== undefined) {
    exportName = generatorNames(schemaName)[generator];
    snippets.push(...GENERATOR_CONFIG[generator](schemaName));
    snippets.push(importChange(generator, exportName));
    if (frontend === "dom") {
      snippets.push({
        title: "Pass the extracted rules to attachRules",
        language: "ts",
        code: `// The generated file attaches rules to the Zod schema. For plain HTML, read the rules instead:\nimport { rulesFromOpenApi } from "validonce/openapi";\nconst rules = rulesFromOpenApi(await (await fetch("/openapi.json")).json(), ${JSON.stringify(schemaName)})!;\nimport { attachRules } from "validonce/dom";\nattachRules(form, rules, { messages });`,
      });
    } else if (frontend === "react") {
      snippets.push({
        title: "Use the generated schema as the resolver",
        language: "tsx",
        code: `import { zodResolver } from "@hookform/resolvers/zod";\nimport { ${exportName} } from "./gen/validonce.gen";\nuseForm({ resolver: zodResolver(${exportName}) });`,
      });
    } else if (frontend === "vue") {
      snippets.push({
        title: "Use the generated schema with VeeValidate",
        language: "ts",
        code: `import { toVeeSchema } from "validonce/vue";\nimport { ${exportName} } from "./gen/validonce.gen";\nuseForm({ validationSchema: toVeeSchema(${exportName}) }); // VeeValidate 5: pass it directly`,
      });
    } else {
      snippets.push({
        title: "Use the generated schema with Signal Forms",
        language: "ts",
        code: `import { validateStandardSchema } from "@angular/forms/signals";\nimport { ${exportName} } from "./gen/validonce.gen";\nform(model, (path) => validateStandardSchema(path, ${exportName}));`,
      });
    }
    notes.push(
      "The plugin runs after each generation and writes validonce.gen.ts next to the generator output; the generator's own files are never modified.",
      "Generators need Node 22.18 or later.",
      "Per-operation aliases (for example PostSignupsBody) stay unwrapped; import the component schema, or name the alias with `map`.",
      "Dependent-field re-checks: react `registerDeps(rules)`, vue `watchDependents(form, rules)`; Angular Signal Forms and attachRules need none.",
    );
    if (frontend === "react" || frontend === "vue")
      snippets.push(LOAD_RULES(schemaName), ...dependentOnly(frontend));
  } else {
    snippets.push(LOAD_RULES(schemaName), ...runtime(frontend, schemaName));
    notes.push("Prefer reading rules from the API or `validonce extract` over pasting them into the client.");
  }
  snippets.push(serverErrors(frontend));
  notes.push("Blank inputs must become null for nullable fields, or the Zod type check fails before the rules run.");
  const out: ClientWiring = { frontend, schemaName, install: INSTALL[frontend], snippets, notes };
  if (generator !== undefined) out.generator = generator;
  if (exportName !== undefined) out.exportName = exportName;
  return out;
}

function dependentOnly(frontend: "react" | "vue"): Snippet[] {
  return frontend === "react"
    ? [{ title: "Dependent fields", language: "tsx", code: `import { registerDeps } from "validonce/react-hook-form";\n\nconst deps = registerDeps(rules);\n<select {...register("plan", { ...deps("plan") })} /> // re-checks "company"` }]
    : [{ title: "Dependent fields", language: "ts", code: `import { watchDependents } from "validonce/vue";\n\nwatchDependents(form, rules); // call once, after useForm` }];
}
