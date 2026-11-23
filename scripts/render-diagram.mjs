// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Renders the "How it works" diagram from metatoy.com/oss/validonce into the PNG the README uses.
// The diagram on the site is HTML and CSS, which a GitHub README cannot render, so this captures
// just that figure at 2x.
//
// Usage, from the repo root, with the React example's dependencies installed:
//   node scripts/render-diagram.mjs            # writes assets/diagram/how-it-works.png
//   DIAGRAM_URL=http://localhost:3000/oss/validonce node scripts/render-diagram.mjs
//   DEMO_CHANNEL=chrome node scripts/render-diagram.mjs   # use the installed Google Chrome

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "examples/react-form/package.json"));
const { chromium } = require("@playwright/test");

const url = process.env.DIAGRAM_URL ?? "https://metatoy.com/oss/validonce";
const out = join(root, "assets/diagram/how-it-works.png");

const browser = await chromium.launch(
  process.env.DEMO_CHANNEL ? { channel: process.env.DEMO_CHANNEL } : {},
);
const page = await browser.newPage({
  viewport: { width: 1100, height: 1400 },
  deviceScaleFactor: 2,
  colorScheme: "light",
  reducedMotion: "reduce",
});
await page.goto(url, { waitUntil: "networkidle" });
const figure = page.locator("figure.vo-flow");
if ((await figure.count()) !== 1) throw new Error(`expected one figure.vo-flow on ${url}`);
await figure.scrollIntoViewIfNeeded();
await page.evaluate(() => document.fonts.ready);
mkdirSync(dirname(out), { recursive: true });
await figure.screenshot({ path: out, animations: "disabled" });
await browser.close();
console.log(`wrote ${out}`);
