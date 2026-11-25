// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { RuleSet } from "validonce";
import { translateCrd } from "validonce/kubernetes";
import type { Catalog } from "validonce/messages";
import crd from "../crd/signup-crd.json";

// The rules come straight from the CRD's x-kubernetes-validations: translateCrd adds x-validonce next
// to them. The form validates `spec`, so it takes the rules on that node. Rules the translator can't
// prove exact are kept as server_only (the browser skips them) or only reported; the dry run catches
// those on submit.

export interface Translated {
  rules: RuleSet;
  catalog: Catalog;
}

export function translateSignupCrd(): Translated {
  const { versions } = translateCrd(crd);
  const version = Object.values(versions)[0];
  if (!version) throw new Error("the CRD has no versions");
  const spec = (version.schema as { properties?: { spec?: Record<string, unknown> } }).properties
    ?.spec;
  const rules = (spec?.["x-validonce"] as RuleSet | undefined) ?? { version: 1, rules: [] };
  return { rules, catalog: version.catalog };
}
