// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// VeeValidate helpers. `vue` and `vee-validate` are optional peer dependencies: this module
// imports only `vue` (for `watch`); vee-validate is matched structurally.

import { type WatchHandle, watch } from "vue";
import { dependentFields, type RulesLike } from "./deps";

export { dependentFields };

// ---------------------------------------------------------------------------
// Schema adapter (vee-validate 4.x)
// ---------------------------------------------------------------------------

/** The part of Standard Schema (https://standardschema.dev) this module reads. */
export interface StandardSchemaLike<TInput = unknown, TOutput = TInput> {
  readonly "~standard": {
    readonly validate: (
      value: unknown,
    ) => StandardResult<TOutput> | Promise<StandardResult<TOutput>>;
    readonly types?: { readonly input: TInput; readonly output: TOutput };
  };
}

type StandardResult<TOutput> =
  | { readonly value: TOutput; readonly issues?: undefined }
  | {
      readonly issues: ReadonlyArray<{
        readonly message: string;
        readonly path?: ReadonlyArray<
          PropertyKey | { readonly key: PropertyKey }
        >;
      }>;
    };

/** vee-validate 4's `TypedSchema` (structural; `__type` is its brand). */
export interface VeeTypedSchema<TInput = unknown, TOutput = TInput> {
  __type: "VVTypedSchema";
  parse(values: TInput): Promise<{
    value?: TOutput;
    errors: { path?: string; errors: string[] }[];
  }>;
}

/** A Standard Schema issue path as vee-validate's path string: `a.b`, `items[1].end`. */
export function veePath(
  path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined,
): string {
  let out = "";
  for (const seg of path ?? []) {
    const key = typeof seg === "object" ? seg.key : seg;
    if (typeof key === "number") out += `[${key}]`;
    else out += out ? `.${String(key)}` : String(key);
  }
  return out;
}

/**
 * Adapt a Standard Schema (a Zod 4 schema, with or without `withRules`) to
 * vee-validate 4's `validationSchema`. vee-validate 5 accepts Standard Schema
 * directly, so this is not needed there.
 *
 * Every issue is kept: issues on the same path are grouped, in order.
 */
export function toVeeSchema<TInput = unknown, TOutput = TInput>(
  schema: StandardSchemaLike<TInput, TOutput>,
): VeeTypedSchema<TInput, TOutput> {
  return {
    __type: "VVTypedSchema",
    async parse(values) {
      const result = await schema["~standard"].validate(values);
      if (!result.issues) return { value: result.value, errors: [] };
      const byPath = new Map<string, string[]>();
      for (const issue of result.issues) {
        const path = veePath(issue.path);
        const list = byPath.get(path) ?? [];
        list.push(issue.message);
        byPath.set(path, list);
      }
      return {
        errors: [...byPath].map(([path, errors]) => ({ path, errors })),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Dependent fields
// ---------------------------------------------------------------------------

/** What `watchDependents` needs from `useForm()`'s return value. */
export interface DependentsForm {
  values: Record<string, unknown>;
  validateField(name: never): Promise<unknown>;
}

function getPath(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const part of path.split(/[.[\]]+/).filter(Boolean)) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Re-validate the fields whose rules read a field when that field changes
 * (`plan` changes -> `company` is checked again; `start` changes -> `end`).
 * Call it once, in `setup()`, next to `useForm`:
 *
 *   const form = useForm({ validationSchema: toVeeSchema(schema) });
 *   watchDependents(form, rules);
 *
 * Returns a function that stops the watchers (they stop with the component anyway).
 */
export function watchDependents(
  form: DependentsForm,
  rules: RulesLike,
): () => void {
  const handles: WatchHandle[] = [];
  for (const [field, dependents] of Object.entries(dependentFields(rules))) {
    handles.push(
      watch(
        () => getPath(form.values, field),
        () => {
          for (const dep of dependents) void form.validateField(dep as never);
        },
        // Deep: an array field changed in place (push, splice, an indexed set) must
        // re-check too, since `present` / `absent` read whether it is empty.
        { deep: true },
      ),
    );
  }
  return () => {
    for (const h of handles) h.stop();
  };
}
