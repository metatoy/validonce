// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { expect, type Page, test } from "@playwright/test";

const api = process.env.VALIDONCE_API ?? "http://localhost:5080";
const port = new URL(api).port;
const backend = port === "8010" ? "fastapi" : "aspnet";
const openapi = port === "8010" ? "/openapi.json" : "/openapi/v1.json";
const url = `/?api=${encodeURIComponent(api)}&openapi=${encodeURIComponent(openapi)}`;

const MSG = {
  company: "Company is required on the Pro plan",
  end: "End date must be on or after the start date",
  quantity: "Quantity must be at least 1",
};

async function load(page: Page) {
  await page.goto(url);
  await expect(page.getByTestId("submit")).toBeVisible();
}

async function fill(page: Page, v: Record<string, string>) {
  await page.getByTestId("plan").selectOption(v.plan ?? "pro");
  await page.getByTestId("company").fill(v.company ?? "");
  await page.getByTestId("email").fill(v.email ?? "ada@example.test");
  await page.getByTestId("start").fill(v.start ?? "2026-03-10");
  await page.getByTestId("end").fill(v.end ?? "");
  await page.getByTestId("quantity").fill(v.quantity ?? "1");
}

test("client: pro plan needs company, no POST made", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/signups")) posts.push(r.url());
  });
  await load(page);
  await fill(page, { plan: "pro", company: "" });
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("error-company")).toHaveText(MSG.company);
  await expectUnderField(page, "company");
  expect(posts).toEqual([]);
  await page.screenshot({ path: `e2e/screenshots/${backend}-client.png` });
});

test("client: end before start and quantity 0", async ({ page }) => {
  await load(page);
  await fill(page, {
    plan: "free",
    start: "2026-03-10",
    end: "2026-03-01",
    quantity: "0",
  });
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("error-end")).toHaveText(MSG.end);
  await expect(page.getByTestId("error-quantity")).toHaveText(MSG.quantity);
});

test("server: skipping browser checks shows the server's 422 errors", async ({
  page,
}) => {
  await load(page);
  await page.getByTestId("skip-client").check();
  await fill(page, {
    plan: "pro",
    company: "",
    start: "2026-03-10",
    end: "2026-03-01",
    quantity: "0",
  });
  const response = page.waitForResponse(
    (r) => r.url().includes("/signups") && r.request().method() === "POST",
  );
  await page.getByTestId("submit").click();
  const res = await response;
  expect(res.status()).toBeGreaterThanOrEqual(400);
  await expect(page.getByTestId("error-company")).toHaveText(MSG.company);
  await expect(page.getByTestId("error-end")).toHaveText(MSG.end);
  await expect(page.getByTestId("error-quantity")).toHaveText(MSG.quantity);
  for (const f of ["company", "end", "quantity"]) await expectUnderField(page, f);
  await page.screenshot({ path: `e2e/screenshots/${backend}-server.png` });
});

test("valid data is saved", async ({ page }) => {
  await load(page);
  await fill(page, {
    plan: "pro",
    company: "Example Co",
    start: "2026-03-10",
    end: "2026-03-12",
    quantity: "2",
  });
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("result")).toHaveText("Saved");
});

test("live update: switching plan clears the company error", async ({ page }) => {
  await load(page);
  await page.getByTestId("plan").selectOption("pro");
  await expect(page.getByTestId("error-company")).toHaveText(MSG.company);
  await page.getByTestId("plan").selectOption("free");
  await expect(page.getByTestId("error-company")).toBeHidden();
});

test("live update: moving start earlier clears the end error", async ({ page }) => {
  await load(page);
  await page.getByTestId("start").fill("2026-03-10");
  await page.getByTestId("end").fill("2026-03-01");
  await expect(page.getByTestId("error-end")).toHaveText(MSG.end);
  await page.getByTestId("start").fill("2026-02-01");
  await expect(page.getByTestId("error-end")).toBeHidden();
});

/** The error must be the element right after the field's label, and the field must point to it. */
async function expectUnderField(page: import("@playwright/test").Page, field: string) {
  await expect(
    page.locator(`label:has([data-testid="${field}"]) + [data-testid="error-${field}"]`),
  ).toBeVisible();
  await expect(page.getByTestId(field)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId(field)).toHaveAttribute("aria-describedby", `error-${field}`);
}
