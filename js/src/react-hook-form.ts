// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { dependentFields, type RulesLike } from "./deps";

export { dependentFields };

/**
 * `register` options for one field: `{ deps: [...] }`, or `{}` when nothing
 * depends on it. Spread into `register`:
 *
 *   const deps = registerDeps(rules);
 *   <input {...register("plan", { ...deps("plan") })} />
 */
export function registerDeps<TName extends string = string>(
  rules: RulesLike,
): (name: TName) => { deps?: TName[] } {
  const map = dependentFields(rules);
  return (name) => {
    const d = Object.hasOwn(map, name) ? map[name] : undefined;
    // The rules come from the server, so their field names are the form's wire names.
    return d ? { deps: [...d] as TName[] } : {};
  };
}
