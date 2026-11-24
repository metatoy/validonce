// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { Issue } from "./types";

/** The 422 body every non-FastAPI backend sends (see rule-format-v1 "Transport"). */
export interface ProblemDetails {
  type: "about:blank";
  title: string;
  status: 422;
  validonce: Issue[];
}

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

export function problemDetails(issues: Issue[]): ProblemDetails {
  return {
    type: "about:blank",
    title: "One or more validation errors occurred.",
    status: 422,
    validonce: issues,
  };
}
