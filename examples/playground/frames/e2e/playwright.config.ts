// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { defineConfig } from "@playwright/test";

// Build the four frames first (`pnpm -r --filter "validonce-playground-frame-*" build`). The spec
// serves each frame's dist and a stub backend itself, so no backend or dev server is needed.
const cached = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const executablePath =
  process.env.PW_CHROMIUM ?? (!process.env.CI && existsSync(cached) ? cached : undefined);

export default defineConfig({
  testDir: ".",
  testMatch: "contact.spec.ts",
  workers: 1,
  timeout: 30_000,
  use: { launchOptions: executablePath ? { executablePath } : {} },
});
