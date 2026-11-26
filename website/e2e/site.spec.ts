// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { expect, test } from "@playwright/test";

test("home page loads with the stack tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Go" })).toBeVisible();
});

test("a stack picked once is kept on other pages", async ({ page }) => {
  await page.goto("/quickstart");
  await page.getByRole("tab", { name: "Go" }).first().click();
  await expect(page.getByText("validonce.MustBuild").first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Go" }).first()).toHaveAttribute("aria-selected", "true");
});

test("a live rule fires in the browser", async ({ page }) => {
  await page.goto("/rules-live");
  const signup = page.getByTestId("live-rule").first();
  await expect(signup.getByText("All rules pass.")).toBeVisible();
  await signup.getByLabel("Plan").selectOption("pro");
  await expect(signup.getByRole("alert")).toHaveText("Company is required on the Pro plan.");
  await signup.getByLabel("Company").fill("Metatoy");
  await expect(signup.getByText("All rules pass.")).toBeVisible();
});

test("the versioned docs and agent files are served", async ({ page, request }) => {
  await page.goto("/docs/next/how-it-works");
  await expect(page.getByText("unreleased", { exact: false }).first()).toBeVisible();
  await page.goto("/docs/how-it-works");
  await expect(page.getByRole("heading", { name: "How it works", level: 1 })).toBeVisible();
  expect((await request.get("/llms.txt")).ok()).toBe(true);
  expect((await request.get("/llms-full.txt")).ok()).toBe(true);
});

test("search finds a page", async ({ page }) => {
  await page.goto("/search?q=FastAPI");
  await expect(page.locator("a[href*='getting-started-fastapi']").first()).toBeVisible();
});

test("the agent setup page and its prompt are served", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Onboard your agent to validonce/ }).click();
  await expect(page.getByRole("heading", { name: "Onboard your agent to validonce", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Cursor" })).toBeVisible();
  const prompt = await request.get("/agent-setup/prompt.md");
  expect(prompt.ok()).toBe(true);
  expect(await prompt.text()).toContain("# Set up validonce in this project");
});
