// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { expect, type Page, test } from "@playwright/test";

const MSG = {
  company: "Company is required on the Pro plan",
  end: "End date must be on or after the start date",
  replicas: "Max replicas must be at least the min replicas",
  contact: "Give an email or a phone number",
  tooLong: "Company must be 40 characters or fewer",
};

async function load(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("submit")).toBeVisible();
}

async function fill(page: Page, v: Record<string, string>) {
  await page.getByTestId("plan").selectOption(v.plan ?? "free");
  for (const f of ["company", "email", "phone", "start", "end", "minReplicas", "maxReplicas"]) {
    const input = page.getByTestId(f);
    // An empty text field gets a real change event (type, then clear), so its error shows.
    if (v[f] === undefined && ["company", "email", "phone"].includes(f)) await input.fill("x");
    await input.fill(v[f] ?? "");
  }
}

test("cross-field errors show before submit", async ({ page }) => {
  await load(page);
  await fill(page, {
    plan: "pro",
    start: "2026-03-10",
    end: "2026-03-01",
    minReplicas: "5",
    maxReplicas: "2",
  });
  await expect(page.getByTestId("error-company")).toHaveText(MSG.company);
  await expect(page.getByTestId("error-end")).toHaveText(MSG.end);
  await expect(page.getByTestId("error-maxReplicas")).toHaveText(MSG.replicas);
  await expect(page.getByTestId("error-email")).toHaveText(MSG.contact);
  for (const f of ["company", "end", "maxReplicas", "email"]) await expectUnderField(page, f);
  await expect(page.getByTestId("result")).toBeHidden();
});

test("errors clear when the other field changes", async ({ page }) => {
  await load(page);
  await fill(page, { start: "2026-03-10", end: "2026-03-01", email: "ada@example.test" });
  await expect(page.getByTestId("error-end")).toHaveText(MSG.end);
  await page.getByTestId("start").fill("2026-02-01");
  await expect(page.getByTestId("error-end")).toBeHidden();
});

test("the server-only rule's error comes from the dry run, under its field", async ({ page }) => {
  await load(page);
  await fill(page, {
    plan: "pro",
    company: "A".repeat(41),
    email: "ada@example.test",
  });
  // Every browser rule passes, so nothing is shown until the dry run answers.
  await expect(page.getByTestId("error-company")).toBeHidden();
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("error-company")).toHaveText(MSG.tooLong);
  await expectUnderField(page, "company");
  await expect(page.getByTestId("result")).toBeHidden();
});

test("valid data is accepted by the dry run", async ({ page }) => {
  await load(page);
  await fill(page, {
    plan: "pro",
    company: "Example Co",
    phone: "+1 555 0100",
    start: "2026-03-10",
    end: "2026-03-12",
    minReplicas: "1",
    maxReplicas: "3",
  });
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("result")).toBeVisible();
});

/** The error must be the element right after the field's label, and the field must point to it. */
async function expectUnderField(page: Page, field: string) {
  await expect(
    page.locator(`label:has([data-testid="${field}"]) + [data-testid="error-${field}"]`),
  ).toBeVisible();
  await expect(page.getByTestId(field)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId(field)).toHaveAttribute("aria-describedby", `error-${field}`);
}
