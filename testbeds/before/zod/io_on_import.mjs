// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// Fixture that does I/O on import: the runner must refuse it with the clear message.
import { readFileSync } from "node:fs";
import { z } from "zod";

const allowed = JSON.parse(readFileSync("allowed.json", "utf8"));
export const Bad = z.object({ x: z.enum(allowed) });
