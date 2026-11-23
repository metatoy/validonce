// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, test } from "vitest";
import { z } from "zod";
import { evaluate } from "../src/evaluate";
import { isoDate, isoDateTime, withRules } from "../src/zod";

// True when validonce's own type check treats `v` as a valid value of `type`: a valid left side
// that is later than the right side makes `lt` fail; an invalid one makes the rule pass.
function validonceValid(type: "date" | "datetime", v: string): boolean {
  const low = type === "date" ? "0001-01-01" : "0001-01-01T00:00:00Z";
  const rules = [
    {
      id: "r",
      kind: "compare",
      left: { field: "a" },
      op: "lt",
      right: { field: "b" },
      type,
      message: { key: "k" },
    },
  ] as const;
  return evaluate(rules as never, { a: v, b: low }).length > 0;
}

const DATES = [
  "0000-01-01",
  "0000-02-29",
  "0001-01-01",
  "2024-02-29",
  "2023-02-29",
  "2024-13-01",
  "2024-1-5",
  "9999-12-31",
  "",
];

const DATETIMES = [
  "0000-01-01T00:00:00Z",
  "0001-01-01T00:00:00Z",
  "2024-01-01T00:00:00Z",
  "2024-01-01T00:00:00.123456Z",
  "2024-01-01T00:00:00+05:30",
  "2024-01-01T00:00:00-23:59",
  "2024-01-01t00:00:00Z",
  "2024-01-01T00:00:00z",
  "2024-01-01T00:00Z",
  "2024-01-01T00:00:00",
  "2024-01-01T00:00:00+0530",
  "2024-01-01T00:00:00+24:00",
  "2024-01-01T23:59:60Z",
  "2023-02-29T00:00:00Z",
  "9999-12-31T23:59:59Z",
];

describe("isoDate", () => {
  test.each(DATES)("agrees with validonce's date type: %s", (v) => {
    expect(isoDate().safeParse(v).success).toBe(validonceValid("date", v));
  });

  test("z.iso.date() alone accepts year 0000 (the gap isoDate closes)", () => {
    expect(z.iso.date().safeParse("0000-01-01").success).toBe(true);
    expect(isoDate().safeParse("0000-01-01").success).toBe(false);
  });

  test("custom message", () => {
    const r = isoDate({ message: "rules.bad_date" }).safeParse("0000-01-01");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("rules.bad_date");
  });

  test("works with withRules and .nullish()", () => {
    const schema = withRules(
      z.object({ start: isoDate(), end: isoDate().nullish() }),
      [
        {
          id: "end",
          kind: "compare",
          left: { field: "end" },
          op: "ge",
          right: { field: "start" },
          type: "date",
          message: { key: "rules.end_after_start" },
        },
      ],
    );
    expect(schema.safeParse({ start: "2024-01-02", end: null }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({ start: "2024-01-02", end: "2024-01-01" }).success,
    ).toBe(false);
    expect(schema.safeParse({ start: "0000-01-01" }).success).toBe(false);
  });
});

describe("isoDateTime", () => {
  test.each(DATETIMES)("agrees with validonce's datetime type: %s", (v) => {
    expect(isoDateTime().safeParse(v).success).toBe(
      validonceValid("datetime", v),
    );
  });
});
