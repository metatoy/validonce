// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { Catalog } from "validonce/messages";
import type { RuleSet } from "validonce";

// TODO(plan-g): replace this stub with `translateCrd(crd)` from `validonce/kubernetes` once the
// translator lands. The rules below are what it should produce for `crd/signup-crd.yaml`
// (the fifth rule, `self.company.size() <= 40`, is not translatable; the translator keeps it as
// a `server_only` rule, which this stub leaves out because browsers skip those anyway).

export interface Translated {
  rules: RuleSet;
  catalog: Catalog;
}

export function translateSignupCrd(): Translated {
  const rules: RuleSet = {
    version: 1,
    rules: [
      {
        id: "k8s.Signup.required_when.1",
        kind: "required_when",
        field: "company",
        when: { eq: { field: "plan", value: "pro" } },
        message: { key: "k8s.Signup.1" },
      },
      {
        id: "k8s.Signup.compare.2",
        kind: "compare",
        left: { field: "end" },
        op: "ge",
        right: { field: "start" },
        type: "date",
        message: { key: "k8s.Signup.2" },
      },
      {
        id: "k8s.Signup.compare.3",
        kind: "compare",
        left: { field: "maxReplicas" },
        op: "ge",
        right: { field: "minReplicas" },
        type: "number",
        message: { key: "k8s.Signup.3" },
      },
      {
        id: "k8s.Signup.at_least_one_of.4",
        kind: "at_least_one_of",
        fields: ["email", "phone"],
        message: { key: "k8s.Signup.4" },
      },
    ],
  };
  const catalog: Catalog = {
    "k8s.Signup.1": "Company is required on the Pro plan",
    "k8s.Signup.2": "End date must be on or after the start date",
    "k8s.Signup.3": "Max replicas must be at least the min replicas",
    "k8s.Signup.4": "Give an email or a phone number",
    "k8s.Signup.5": "Company must be 40 characters or fewer",
  };
  return { rules, catalog };
}
