// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { expect, test } from "vitest";
import { FORMAT_VERSION } from "../src/index";

test("FORMAT_VERSION is 1", () => {
  expect(FORMAT_VERSION).toBe(1);
});
