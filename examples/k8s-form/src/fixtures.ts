// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// A Kubernetes 422 `Status`, as the API server answers a `dryRun=All` create of a Signup whose
// company is longer than 40 characters. The CEL rule is `self.company.size() <= 40` with
// `fieldPath: .company`. This example has no cluster, so the form plays this answer back.
export const companyTooLongStatus = {
  kind: "Status",
  apiVersion: "v1",
  metadata: {},
  status: "Failure",
  message:
    'Signup.example.test "demo" is invalid: spec.company: Invalid value: "string": Company must be 40 characters or fewer',
  reason: "Invalid",
  details: {
    name: "demo",
    group: "example.test",
    kind: "Signup",
    causes: [
      {
        reason: "FieldValueInvalid",
        message:
          'Invalid value: "string": Company must be 40 characters or fewer',
        field: "spec.company",
      },
    ],
  },
  code: 422,
} as const;

/** Stands in for `POST <resource>?dryRun=All`: the recorded failure, or a success. */
export function simulateDryRun(values: { company: string | null }): {
  status: number;
  body: unknown;
} {
  if ((values.company ?? "").length > 40) {
    return { status: 422, body: companyTooLongStatus };
  }
  return { status: 201, body: { kind: "Signup", apiVersion: "example.test/v1" } };
}
