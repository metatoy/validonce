// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// Fixture that does I/O on import (network): the runner must refuse it with the clear message.
import net from "node:net";
import * as yup from "yup";

net.connect(80, "example.test");
export const Bad = yup.object({ x: yup.string() });
