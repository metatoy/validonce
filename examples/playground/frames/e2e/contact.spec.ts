// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

// One spec for all four frames. Each frame's built bundle (frames/<fw>/dist) and a stub backend
// (OpenAPI document with the Contact x-validonce, and a POST /contacts that always answers 422)
// are served by one small node server, so no real backend is needed.

const FRAMEWORKS = ["react", "angular", "vue", "dom"] as const;
const ROOT = resolve(import.meta.dirname, "..");

const CONTACT_RULES = {
  version: 1,
  rules: [
    {
      id: "Contact.at_least_one_of.email",
      kind: "at_least_one_of",
      fields: ["email", "phone"],
      message: { key: "rules.contact_email_or_phone" },
    },
    {
      id: "Contact.all_or_none.street",
      kind: "all_or_none",
      fields: ["street", "city", "postalCode"],
      message: { key: "rules.address_all_or_none" },
    },
    {
      id: "Contact.required_when.postalCode",
      kind: "required_when",
      field: "postalCode",
      when: { eq: { field: "country", value: "US" } },
      message: { key: "rules.postal_code_required_us" },
    },
    {
      id: "Contact.compare.availableTo",
      kind: "compare",
      left: { field: "availableTo" },
      op: "ge",
      right: { field: "availableFrom" },
      type: "date",
      message: { key: "rules.available_to_after_from" },
    },
  ],
};

const OPENAPI = {
  openapi: "3.1.0",
  info: { title: "stub", version: "1" },
  paths: {},
  components: { schemas: { Contact: { type: "object", "x-validonce": CONTACT_RULES } } },
};

// The shared 422 shape (ProblemDetails with a top-level `validonce` list).
const UNPROCESSABLE = {
  type: "about:blank",
  title: "Validation failed",
  status: 422,
  validonce: [
    {
      path: ["postalCode"],
      ruleId: "Contact.required_when.postalCode",
      key: "rules.postal_code_required_us",
      params: {},
    },
    {
      path: ["postalCode"],
      ruleId: "Contact.all_or_none.street",
      key: "rules.address_all_or_none",
      params: {},
    },
  ],
};

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

let server: Server;
let origin = "";

test.beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://stub");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
      } else if (url.pathname === "/openapi.json") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(OPENAPI));
      } else if (url.pathname === "/contacts" && req.method === "POST") {
        res
          .writeHead(422, { "content-type": "application/problem+json" })
          .end(JSON.stringify(UNPROCESSABLE));
      } else {
        const [, fw = "", ...rest] = url.pathname.split("/");
        if (!(FRAMEWORKS as readonly string[]).includes(fw)) {
          res.writeHead(404).end();
          return;
        }
        const dist = join(ROOT, fw, "dist");
        const rel = normalize(rest.join("/") || "index.html").replace(/^(\.\.[/\\])+/, "");
        try {
          const file = await readFile(join(dist, rel));
          res
            .writeHead(200, { "content-type": TYPES[extname(rel)] ?? "application/octet-stream" })
            .end(file);
        } catch {
          res.writeHead(404).end();
        }
      }
    })();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => {
  server.close();
});

declare global {
  interface Window {
    __messages: Record<string, unknown>[];
  }
}

async function open(page: Page, fw: string, extra = ""): Promise<void> {
  // The frame is the top page here, so its postMessage to window.parent lands on itself.
  await page.addInitScript(() => {
    window.__messages = [];
    window.addEventListener("message", (e) => {
      if (typeof e.data === "object" && e.data?.type?.startsWith("validonce:"))
        window.__messages.push(e.data);
    });
  });
  await page.goto(
    `${origin}/${fw}/index.html?api=${origin}&openapi=/openapi.json&schema=Contact${extra}`,
  );
  await expect(page.getByTestId("field-email")).toBeVisible();
}

for (const fw of FRAMEWORKS) {
  test.describe(fw, () => {
    test("a US address without a postal code shows its error", async ({ page }) => {
      await open(page, fw);
      await page.getByTestId("field-street").fill("1 Main St");
      await page.getByTestId("field-city").fill("Springfield");
      await expect(page.getByTestId("error-postalCode")).toHaveText(
        "Postal code is required in the US",
      );
      // The all-or-none rule lands on the street, and is not shown twice on the postal code.
      await expect(page.getByTestId("error-street")).toHaveText(
        "Fill in street, city and postal code together",
      );
    });

    test("neither email nor phone shows the email error", async ({ page }) => {
      await open(page, fw);
      await page.getByTestId("field-email").fill("a@b.co");
      await expect(page.getByTestId("error-email")).toBeHidden();
      await page.getByTestId("field-email").fill("");
      await expect(page.getByTestId("error-email")).toHaveText("Enter an email or a phone number");
    });

    test("available to before available from shows its error", async ({ page }) => {
      await open(page, fw);
      await page.getByTestId("field-availableFrom").fill("2026-12-10");
      await page.getByTestId("field-availableTo").fill("2026-12-01");
      await expect(page.getByTestId("error-availableTo")).toHaveText(
        "Available to must be on or after available from",
      );
      await page.getByTestId("field-availableTo").fill("2026-12-20");
      await expect(page.getByTestId("error-availableTo")).toBeHidden();
    });

    test("one error per field, with +1 more", async ({ page }) => {
      await open(page, fw);
      await page.getByTestId("toggle-skip").check();
      await page.getByTestId("submit").click();
      // The stub sends two issues for the postal code: one shows, the other sits behind "+1 more".
      await expect(page.getByTestId("error-postalCode")).toHaveText(
        "Postal code is required in the US",
      );
      await expect(page.getByTestId("more-postalCode")).toHaveText("+1 more");
      await page.getByTestId("more-postalCode").click();
      await expect(page.getByTestId("error-more-postalCode")).toContainText(
        "Fill in street, city and postal code together",
      );
    });

    test("with browser checks skipped, the server's 422 lands with a badge", async ({ page }) => {
      await open(page, fw);
      await page.getByTestId("toggle-skip").check();
      await page.getByTestId("field-email").fill("a@b.co");
      await page.getByTestId("submit").click();
      await expect(page.getByTestId("error-postalCode")).toHaveText(
        "Postal code is required in the US",
      );
      await expect(page.getByTestId("badge-server-postalCode")).toBeVisible();
      await expect(page.getByTestId("badge-server-email")).toBeHidden();
    });

    test("it posts ready, issues and request messages to the parent", async ({ page }) => {
      await open(page, fw);
      await page.getByTestId("toggle-skip").check();
      await page.getByTestId("field-email").fill("a@b.co");
      await page.getByTestId("submit").click();
      await expect(page.getByTestId("badge-server-postalCode")).toBeVisible();
      const messages = await page.evaluate(() => window.__messages);
      expect(messages).toContainEqual({ type: "validonce:ready", framework: fw });
      const request = messages.find((m) => m.type === "validonce:request");
      expect(request).toMatchObject({ method: "POST", status: 422 });
      expect(String(request?.url)).toBe(`${origin}/contacts`);
      const serverIssues = messages.find(
        (m) =>
          m.type === "validonce:issues" &&
          m.source === "server" &&
          (m.issues as unknown[]).length > 0,
      );
      expect(((serverIssues?.issues ?? []) as unknown[])[0]).toMatchObject({
        ruleId: "Contact.required_when.postalCode",
        key: "rules.postal_code_required_us",
      });
      expect(messages.some((m) => m.type === "validonce:issues" && m.source === "client")).toBe(
        true,
      );
    });

    test("it listens for validonce:set from the parent", async ({ page }) => {
      await open(page, fw);
      await page.evaluate(() =>
        window.postMessage({ type: "validonce:set", skipClient: true }, "*"),
      );
      await expect(page.getByTestId("toggle-skip")).toBeChecked();
    });

    test("?theme=dark switches the theme", async ({ page }) => {
      await open(page, fw, "&theme=dark");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    });
  });
}
