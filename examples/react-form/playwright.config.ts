// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { defineConfig } from "@playwright/test";

// On CI, Playwright's own browser download is used. Locally, PW_CHROMIUM or a cached
// headless shell is used when present, because this Playwright release's matching browser
// may not be installed.
const cached = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const executablePath = process.env.PW_CHROMIUM ?? (!process.env.CI && existsSync(cached) ? cached : undefined);

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
