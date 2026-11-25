// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { serveDist, stubApi } from "./stub";

// The shell's built site (shell/dist, frames included) is served here, and the production API host
// (play-api.metatoy.com) is stubbed with a backend that always answers 422, so no backend is needed.

let server: Server;
let origin = "";

test.beforeAll(async () => {
  ({ server, origin } = await serveDist());
});
test.afterAll(() => {
  server.close();
});
test.beforeEach(async ({ context }) => {
  await stubApi(context);
});

test("the pickers write the URL and load the chosen frame", async ({ page }) => {
  await page.goto(`${origin}/`);
  await expect(page).toHaveURL(`${origin}/`);
  await page.getByTestId("backend-go").click();
  await page.getByTestId("frontend-vue").click();
  await expect(page).toHaveURL(`${origin}/?backend=go&frontend=vue`);
  await expect(page.getByTestId("share-url")).toContainText("?backend=go&frontend=vue");
  const src = await page.getByTestId("frame").getAttribute("src");
  expect(src).toContain("/frames/vue/index.html");
  expect(src).toContain("api=https%3A%2F%2Fplay-api.metatoy.com%2Fgo");
  await expect(page.frameLocator("[data-testid=frame]").getByTestId("field-email")).toBeVisible();
  // The footer follows the pair.
  await expect(page.getByRole("link", { name: /Codespaces/ })).toHaveAttribute(
    "href",
    "https://codespaces.new/metatoy/validonce",
  );
  await expect(page.getByRole("link", { name: /Getting started: Go/ })).toHaveAttribute(
    "href",
    /getting-started-go\.md$/,
  );
});

test("a shared link opens the same pair", async ({ page }) => {
  await page.goto(`${origin}/?backend=nestjs&frontend=angular`);
  await expect(page.getByTestId("backend-nestjs")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("frontend-angular")).toHaveAttribute("aria-checked", "true");
  await expect(page.frameLocator("[data-testid=frame]").getByTestId("field-email")).toBeVisible();
});

test("the panels fill: rule source, x-validonce and (after a submit) the response", async ({
  page,
}) => {
  await page.goto(`${origin}/?backend=go&frontend=react`);
  const rule = page.getByTestId("panel-rule");
  await expect(rule).toContainText("Rule in Go");
  await expect(rule).toContainText("AtLeastOneOf");
  await expect(page.getByTestId("panel-x")).toContainText("Contact.required_when.postalCode");
  await expect(page.getByTestId("panel-response")).toContainText("Submit the form");
});

test("a browser-side error shows in the frame", async ({ page }) => {
  await page.goto(`${origin}/?backend=fastapi&frontend=react`);
  const frame = page.frameLocator("[data-testid=frame]");
  await frame.getByTestId("field-email").fill("a@b.co");
  await frame.getByTestId("field-email").fill("");
  await expect(frame.getByTestId("error-email")).toHaveText("Enter an email or a phone number");
});

test("the toggle skips browser checks; the 422 comes back with numbered markers", async ({
  page,
}) => {
  await page.goto(`${origin}/?backend=go&frontend=react`);
  const frame = page.frameLocator("[data-testid=frame]");
  await expect(frame.getByTestId("field-email")).toBeVisible();
  await page.getByTestId("skip-toggle").check({ force: true });
  await expect(frame.getByTestId("toggle-skip")).toBeChecked(); // synced to the frame
  await expect(page.getByTestId("skip-note")).toBeVisible();
  await frame.getByTestId("field-email").fill("a@b.co");
  await frame.getByTestId("submit").click();
  await expect(frame.getByTestId("badge-server-postalCode")).toBeVisible();

  // The response panel and the 422 body.
  await expect(page.getByTestId("status")).toHaveText("422");
  await expect(page.getByTestId("request-line")).toContainText("play-api.metatoy.com/go/contacts");
  const response = page.getByTestId("panel-response");
  await expect(response).toContainText('"ruleId": "Contact.required_when.postalCode"');
  // Two server issues, numbered 1 and 2 in the order sent, in all three panels.
  for (const panel of ["rule", "x", "response"]) {
    const p = page.getByTestId(`panel-${panel}`);
    await expect(p.getByTestId("marker-1").first()).toBeVisible();
    await expect(p.getByTestId("marker-2").first()).toBeVisible();
    await expect(p.getByTestId("marker-3")).toHaveCount(0);
  }
  // The numbers sit on the matching rule lines: 1 = required_when, 2 = all_or_none.
  await expect(
    page.getByTestId("panel-rule").locator(".ln.hit", { hasText: "Require(" }),
  ).toBeVisible();
  const first = page.getByTestId("panel-x").locator(".ln.hit", { hasText: "Contact.required_when.postalCode" });
  await expect(first.locator("[data-testid=marker-1]")).toBeVisible();
});

test("the theme toggle switches light and dark live, without reloading the frame", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${origin}/`);
  const html = page.locator("html");
  const frame = page.frameLocator("[data-testid=frame]");
  await frame.getByTestId("field-email").fill("keep@me.test");
  const src = await page.getByTestId("frame").getAttribute("src");
  await page.getByTestId("theme-toggle").click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(frame.getByTestId("field-email")).toHaveValue("keep@me.test");
  expect(await page.getByTestId("frame").getAttribute("src")).toBe(src);
  await page.getByTestId("theme-toggle").click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "light");
});

test("the shell's toggle is the only one: the frame's own is hidden", async ({ page }) => {
  await page.goto(`${origin}/?backend=go&frontend=react`);
  const frame = page.frameLocator("[data-testid=frame]");
  await expect(frame.getByTestId("field-email")).toBeVisible();
  await expect(frame.getByTestId("toggle-skip")).toBeHidden();
  await expect(page.getByTestId("skip-toggle")).toBeAttached();
});

test("the server's numbers appear on the fields in the frame, and clear on the next edit", async ({
  page,
}) => {
  await page.goto(`${origin}/?backend=go&frontend=vue`);
  const frame = page.frameLocator("[data-testid=frame]");
  await page.getByTestId("skip-toggle").check({ force: true });
  await frame.getByTestId("field-email").fill("a@b.co");
  await frame.getByTestId("field-street").fill("1 Main St");
  await frame.getByTestId("submit").click();
  // 1 = required_when (postal code), 2 = all_or_none (street).
  await expect(frame.getByTestId("error-postalCode")).toHaveAttribute("data-marker", "1");
  await expect(frame.getByTestId("error-street")).toHaveAttribute("data-marker", "2");
  await frame.getByTestId("field-phone").fill("+1 555 010 0199");
  await expect(frame.getByTestId("error-postalCode")).not.toHaveAttribute("data-marker", /.*/);
});

test("the x-validonce panel is compact: a rule takes one to three lines", async ({ page }) => {
  await page.goto(`${origin}/?backend=go&frontend=react`);
  const panel = page.getByTestId("panel-x");
  await expect(panel).toContainText("Contact.compare.availableTo");
  const lines = await panel.locator(".ln").count();
  expect(lines).toBeLessThanOrEqual(14);
  // One rule's id and kind share a line.
  await expect(
    panel.locator(".ln", { hasText: '"id": "Contact.all_or_none.street", "kind": "all_or_none"' }),
  ).toHaveCount(1);
});

test("the system's dark preference is followed", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${origin}/`);
  await expect(page.getByTestId("frame")).toHaveAttribute("src", /theme=dark/);
});

test("the Kubernetes option shows the CEL, a simulated note and the translated rules", async ({
  page,
}) => {
  await page.goto(`${origin}/?backend=k8s&frontend=react`);
  await expect(page.getByTestId("simulated-note")).toBeVisible();
  await expect(page.getByTestId("backend-k8s")).toContainText("simulated server");
  await expect(page.getByTestId("panel-rule")).toContainText("has(self.email) || has(self.phone)");
  await expect(page.getByTestId("panel-x")).toContainText("at_least_one_of");
  const src = await page.getByTestId("frame").getAttribute("src");
  expect(src).toContain("crd=");
  expect(src).not.toContain("openapi=");
  // The frame reads the rules from the CRD.
  const frame = page.frameLocator("[data-testid=frame]");
  await frame.getByTestId("field-email").fill("a@b.co");
  await frame.getByTestId("field-email").fill("");
  await expect(frame.getByTestId("error-email")).toHaveText("Enter an email or a phone number");
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("panels become tabs and the pickers become selects", async ({ page }) => {
    await page.goto(`${origin}/`);
    await expect(page.getByTestId("tabs")).toBeVisible();
    await expect(page.getByTestId("backend-select")).toBeVisible();
    await expect(page.getByTestId("backend-go")).toBeHidden();
    await expect(page.getByTestId("panel-rule")).toBeVisible();
    await expect(page.getByTestId("panel-x")).toBeHidden();
    await page.getByTestId("tab-x").click();
    await expect(page.getByTestId("panel-x")).toBeVisible();
    await expect(page.getByTestId("panel-rule")).toBeHidden();
    await page.getByTestId("backend-select").selectOption("go");
    await expect(page).toHaveURL(/backend=go/);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });
});
