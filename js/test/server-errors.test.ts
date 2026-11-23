// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, test } from "vitest";
import {
  fieldErrorsFromIssues,
  issuesFromFastApi,
  issuesFromProblemDetails,
  issuesFromResponse,
} from "../src/server-errors";

const fastapi = {
  detail: [
    {
      type: "validonce.compare",
      loc: ["body", "bookings", 1, "end"],
      msg: "rules.end_after_start",
      input: {},
      ctx: {
        ruleId: "Booking.compare.end",
        key: "rules.end_after_start",
        params: {},
      },
    },
    {
      type: "validonce.compare",
      loc: ["body", "quantity"],
      msg: "x",
      ctx: {
        ruleId: "Signup.compare.quantity",
        key: "rules.quantity_min",
        params: { min: 1 },
      },
    },
    {
      type: "string_type",
      loc: ["body", "email"],
      msg: "Input should be a string",
    },
  ],
};

const problem = {
  type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  title: "One or more validation errors occurred.",
  status: 400,
  errors: { Company: ["x"] },
  validonce: [
    {
      path: ["company"],
      ruleId: "Signup.required_when.company",
      key: "rules.company_required",
      params: {},
    },
    {
      path: ["quantity"],
      ruleId: "Signup.compare.quantity",
      key: "rules.quantity_min",
      params: { min: 1 },
    },
  ],
};

describe("server-errors", () => {
  test("FastAPI 422 with nested loc", () => {
    expect(issuesFromFastApi(fastapi)).toEqual([
      {
        path: ["bookings", "1", "end"],
        ruleId: "Booking.compare.end",
        key: "rules.end_after_start",
        params: {},
      },
      {
        path: ["quantity"],
        ruleId: "Signup.compare.quantity",
        key: "rules.quantity_min",
        params: { min: 1 },
      },
    ]);
  });

  test("ProblemDetails extension", () => {
    expect(issuesFromProblemDetails(problem)).toEqual(problem.validonce);
  });

  test("issuesFromResponse detects both and ignores others", () => {
    expect(issuesFromResponse(fastapi)).toHaveLength(2);
    expect(issuesFromResponse(problem)).toHaveLength(2);
    expect(issuesFromResponse({ error: "boom" })).toEqual([]);
    expect(issuesFromResponse(null)).toEqual([]);
    expect(issuesFromResponse("x")).toEqual([]);
    expect(issuesFromProblemDetails({ validonce: [{ path: "x" }, 3] })).toEqual(
      [],
    );
  });

  test("fieldErrorsFromIssues", () => {
    const issues = issuesFromResponse(problem);
    expect(
      fieldErrorsFromIssues(issues, {
        "rules.quantity_min": "Quantity must be at least {min}",
      }),
    ).toEqual({
      company: "rules.company_required",
      quantity: "Quantity must be at least 1",
    });
    expect(fieldErrorsFromIssues(issuesFromFastApi(fastapi))).toHaveProperty(
      "bookings.1.end",
    );
  });
});
