// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { defineConfig } from "@playwright/test";

// `pnpm build` first. The smoke test serves build/ itself.
const cached = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const executablePath =
  process.env.PW_CHROMIUM ?? (!process.env.CI && existsSync(cached) ? cached : undefined);

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3210",
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: "pnpm exec docusaurus serve --port 3210 --no-open",
    url: "http://localhost:3210",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
