// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, test } from "vitest";
import {
  dryRunIssues,
  dryRunUrl,
  k8sServerCatalog,
  splitFieldPath,
} from "../src/kubernetes-dryrun";
import { fieldErrorsFromIssues } from "../src/server-errors";

// Shape of a real 422 from a CRD with x-kubernetes-validations (API conventions: Status).
const celOnSpec = {
  kind: "Status",
  apiVersion: "v1",
  metadata: {},
  status: "Failure",
  message:
    'Signup.example.test "demo" is invalid: spec: Invalid value: "object": company must be 40 characters or fewer',
  reason: "Invalid",
  details: {
    name: "demo",
    group: "example.test",
    kind: "Signup",
    causes: [
      {
        reason: "FieldValueInvalid",
        message:
          'Invalid value: "object": company must be 40 characters or fewer',
        field: "spec",
      },
    ],
  },
  code: 422,
};

const celWithFieldPath = {
  kind: "Status",
  apiVersion: "v1",
  metadata: {},
  status: "Failure",
  message:
    'Signup.example.test "demo" is invalid: spec.company: Invalid value: "string": company must be 40 characters or fewer',
  reason: "Invalid",
  details: {
    name: "demo",
    group: "example.test",
    kind: "Signup",
    causes: [
      {
        reason: "FieldValueInvalid",
        message:
          'Invalid value: "string": company must be 40 characters or fewer',
        field: "spec.company",
      },
    ],
  },
  code: 422,
};

const several = {
  kind: "Status",
  apiVersion: "v1",
  metadata: {},
  status: "Failure",
  message:
    'Signup.example.test "demo" is invalid: [spec.plan: Unsupported value: "gold": supported values: "free", "pro", spec.items[2].end: Required value]',
  reason: "Invalid",
  details: {
    name: "demo",
    group: "example.test",
    kind: "Signup",
    causes: [
      {
        reason: "FieldValueNotSupported",
        message: 'Unsupported value: "gold": supported values: "free", "pro"',
        field: "spec.plan",
      },
      {
        reason: "FieldValueRequired",
        message: "Required value",
        field: "spec.items[2].end",
      },
      {
        reason: "FieldValueInvalid",
        message: "Invalid value: 7: must be at most 5",
        field: "spec.items[0].count",
      },
      {
        reason: "FieldValueInvalid",
        message: 'Invalid value: "string": bad name',
        field: 'spec.labels["a.b"]',
      },
      {
        reason: "FieldValueInvalid",
        message: 'Invalid value: "x": bad',
        field: "metadata.name",
      },
    ],
  },
  code: 422,
};

describe("dryRunIssues", () => {
  test("CEL failure without fieldPath lands on the object", () => {
    const issues = dryRunIssues(celOnSpec);
    expect(issues).toEqual([
      {
        path: [],
        ruleId: "k8s.server",
        key: "k8s.server",
        params: {
          message: "company must be 40 characters or fewer",
          reason: "FieldValueInvalid",
        },
      },
    ]);
  });

  test("CEL failure with fieldPath lands on the field", () => {
    const issues = dryRunIssues(celWithFieldPath);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(["company"]);
    expect(issues[0]?.params).toEqual({
      message: "company must be 40 characters or fewer",
      reason: "FieldValueInvalid",
    });
  });

  test("several causes, indexes, quoted keys, outside root", () => {
    const issues = dryRunIssues(several);
    expect(issues.map((i) => i.path)).toEqual([
      ["plan"],
      ["items", "2", "end"],
      ["items", "0", "count"],
      ["labels", "a.b"],
      ["metadata", "name"],
    ]);
    expect(issues[0]?.params).toEqual({
      message: 'supported values: "free", "pro"',
      reason: "FieldValueNotSupported",
    });
    expect(issues[1]?.params).toEqual({
      message: "Required value",
      reason: "FieldValueRequired",
    });
    expect(issues[2]?.params.message).toBe("must be at most 5");
  });

  test("root option", () => {
    expect(dryRunIssues(several, { root: "" })[0]?.path).toEqual([
      "spec",
      "plan",
    ]);
    expect(dryRunIssues(several, { root: "spec.items" })[1]?.path).toEqual([
      "2",
      "end",
    ]);
    expect(dryRunIssues(celOnSpec, { root: "spec" })[0]?.path).toEqual([]);
  });

  test("works with fieldErrorsFromIssues and the catalog", () => {
    const errors = fieldErrorsFromIssues(
      dryRunIssues(celWithFieldPath),
      k8sServerCatalog,
    );
    expect(errors).toEqual({
      company: "company must be 40 characters or fewer",
    });
  });

  test("without the catalog the key is shown", () => {
    expect(fieldErrorsFromIssues(dryRunIssues(celWithFieldPath))).toEqual({
      company: "k8s.server",
    });
  });

  test("a message with braces is not re-interpolated", () => {
    const body = {
      ...celWithFieldPath,
      details: {
        causes: [
          {
            reason: "FieldValueInvalid",
            message: 'Invalid value: "x": use {message}',
            field: "spec.company",
          },
        ],
      },
    };
    expect(fieldErrorsFromIssues(dryRunIssues(body), k8sServerCatalog)).toEqual(
      {
        company: "use {message}",
      },
    );
  });

  test("Invalid status with no causes becomes one object-level issue", () => {
    const issues = dryRunIssues({
      kind: "Status",
      status: "Failure",
      reason: "Invalid",
      code: 422,
      message: "Signup.example.test is invalid",
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual([]);
    expect(issues[0]?.params.message).toBe("Signup.example.test is invalid");
  });

  test("ignores other bodies and other failures", () => {
    expect(dryRunIssues(null)).toEqual([]);
    expect(dryRunIssues("x")).toEqual([]);
    expect(dryRunIssues({ kind: "Signup" })).toEqual([]);
    expect(
      dryRunIssues({ kind: "Status", status: "Success", code: 200 }),
    ).toEqual([]);
    expect(
      dryRunIssues({
        kind: "Status",
        status: "Failure",
        reason: "Forbidden",
        code: 403,
        message: "forbidden",
      }),
    ).toEqual([]);
    expect(dryRunIssues({ detail: [] })).toEqual([]);
  });

  test("malformed causes are skipped", () => {
    const issues = dryRunIssues({
      kind: "Status",
      status: "Failure",
      reason: "Invalid",
      code: 422,
      details: {
        causes: [
          null,
          3,
          { field: "spec.a", message: "Invalid value: 1: bad" },
        ],
      },
    });
    expect(issues.map((i) => i.path)).toEqual([["a"]]);
    expect(issues[0]?.params.reason).toBe("");
  });
});

describe("splitFieldPath", () => {
  test("dots and indexes", () => {
    expect(splitFieldPath("spec.items[2].end")).toEqual([
      "spec",
      "items",
      "2",
      "end",
    ]);
    expect(splitFieldPath("spec.m[foo]")).toEqual(["spec", "m", "foo"]);
    expect(splitFieldPath('spec.m["a\\"b.c"].x')).toEqual([
      "spec",
      "m",
      'a"b.c',
      "x",
    ]);
    expect(splitFieldPath("")).toEqual([]);
  });
});

describe("dryRunUrl", () => {
  test("adds dryRun=All", () => {
    expect(dryRunUrl("/apis/example.test/v1/namespaces/default/signups")).toBe(
      "/apis/example.test/v1/namespaces/default/signups?dryRun=All",
    );
    expect(
      dryRunUrl(
        "https://k8s.example.test:6443/apis/x/v1/signups?fieldManager=ui",
      ),
    ).toBe(
      "https://k8s.example.test:6443/apis/x/v1/signups?fieldManager=ui&dryRun=All",
    );
  });
  test("replaces an existing dryRun and keeps the hash", () => {
    expect(dryRunUrl("/a?dryRun=Foo&x=1#h")).toBe("/a?dryRun=All&x=1#h");
  });
});
