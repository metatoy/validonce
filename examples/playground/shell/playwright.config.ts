// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { defineConfig } from "@playwright/test";

// `pnpm --filter validonce-playground-shell build` first (it needs the four frames built). The spec
// serves shell/dist and a stub backend itself, so no backend or dev server is needed.
const cached = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const executablePath =
  process.env.PW_CHROMIUM ?? (!process.env.CI && existsSync(cached) ? cached : undefined);

export default defineConfig({
  testDir: "e2e",
  testMatch: "shell.spec.ts",
  workers: 1,
  timeout: 30_000,
  use: { launchOptions: executablePath ? { executablePath } : {} },
});
