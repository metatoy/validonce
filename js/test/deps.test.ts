// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, it } from "vitest";
import { dependentFields } from "../src/deps";
import { dependentFields as fromReact } from "../src/react-hook-form";

describe("validonce/deps", () => {
  it("is the same function the React helper re-exports", () => {
    expect(fromReact).toBe(dependentFields);
  });

  it("maps a compare's right field to its reported path", () => {
    expect(
      dependentFields([
        {
          id: "c",
          kind: "compare",
          left: { field: "end" },
          op: "ge",
          right: { field: "start" },
          type: "date",
          message: { key: "k" },
        },
      ]),
    ).toEqual({ start: ["end"] });
  });
});
