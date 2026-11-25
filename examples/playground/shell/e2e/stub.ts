// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// A stub backend and a static server for shell/dist, shared by the spec and the screenshot script.

import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import type { BrowserContext } from "@playwright/test";

export const DIST = resolve(import.meta.dirname, "../dist");

export const CONTACT_RULES = {
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

export const UNPROCESSABLE = {
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
      path: ["street"],
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
  ".svg": "image/svg+xml",
};

/** Serve shell/dist (frames included) on a free port. */
export async function serveDist(): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://dist");
      const rel = normalize(url.pathname === "/" ? "index.html" : url.pathname).replace(
        /^(\.\.[/\\])+/,
        "",
      );
      try {
        const file = await readFile(join(DIST, rel));
        res
          .writeHead(200, { "content-type": TYPES[extname(rel)] ?? "application/octet-stream" })
          .end(file);
      } catch {
        res.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

/** Answer everything the shell and its frames ask of https://play-api.metatoy.com. */
export async function stubApi(context: BrowserContext): Promise<void> {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
  };
  await context.route("https://play-api.metatoy.com/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
    } else if (req.method() === "POST" && path.endsWith("/contacts")) {
      await route.fulfill({
        status: 422,
        headers: { ...cors, "content-type": "application/problem+json" },
        body: JSON.stringify(UNPROCESSABLE),
      });
    } else if (/openapi|api-docs/.test(path)) {
      await route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify(OPENAPI),
      });
    } else {
      await route.fulfill({ status: 404, headers: cors });
    }
  });
}
