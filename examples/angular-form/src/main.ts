// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { App } from "./app";

bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).catch(
  (e: unknown) => console.error(e),
);
