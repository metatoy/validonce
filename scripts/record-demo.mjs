// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Records the README GIF: one rule failing in the browser, then the same rule failing on the
// server (client check skipped), with the error under the same field both times.
//
// Usage, from the repo root, with ffmpeg installed and the React example's dependencies installed:
//   bash scripts/demo.sh            # ASP.NET + React on http://localhost:5173
//   node scripts/record-demo.mjs    # writes assets/demo/validonce-demo.gif
//   bash scripts/demo.sh --stop

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "examples/react-form/package.json"));
const { chromium } = require("@playwright/test");

const url = process.env.DEMO_URL ?? "http://localhost:5173/";
const out = join(root, "assets/demo/validonce-demo.gif");
const work = mkdtempSync(join(tmpdir(), "validonce-demo-"));
const size = { width: 520, height: 660 };

// DEMO_CHANNEL=chrome uses the installed Google Chrome instead of a Playwright download.
const browser = await chromium.launch(
  process.env.DEMO_CHANNEL ? { channel: process.env.DEMO_CHANNEL } : {},
);
const context = await browser.newContext({ viewport: size });
const page = await context.newPage();

// Frames are screenshots at FPS, assembled by the system ffmpeg (no Playwright video download).
const FPS = 10;
let frame = 0;
const shot = () =>
  page.screenshot({ path: join(work, `f${String(frame++).padStart(4, "0")}.png`) });
const pause = async (ms) => {
  for (let i = 0; i < Math.round((ms / 1000) * FPS); i++) await shot();
};
const type = async (testId, text) => {
  for (const ch of text) {
    await page.getByTestId(testId).press(ch === " " ? "Space" : ch);
    await shot();
  }
};

// A caption bar at the top says which side ran the rule.
const caption = (text) =>
  page.evaluate((t) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-caption";
      el.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:9;padding:10px 14px;background:#231f20;" +
        "color:#e8e2d2;font:600 15px system-ui,sans-serif";
      document.body.append(el);
      document.body.style.paddingTop = "44px";
    }
    el.textContent = t;
  }, text);

await page.goto(url);
await page.getByTestId("submit").waitFor();
await caption("Rule written once on the server (ASP.NET Core)");
await pause(800);

// 1. The browser runs the rule: Pro plan without a company.
await caption("1. The browser checks the rule: Pro plan needs a company");
await page.getByTestId("plan").selectOption("pro");
await type("email", "ada@example.test");
await page.getByTestId("start").fill("2026-03-10");
await page.getByTestId("quantity").fill("1");
await pause(400);
await page.getByTestId("submit").click();
await page.getByTestId("error-company").waitFor({ state: "visible" });
await pause(1800);

// 2. Skip the browser check: the server enforces the same rule and the error lands on the
//    same field.
// A fresh page, so the error shown can only have come from the server's 422.
await page.reload();
await page.getByTestId("submit").waitFor();
await caption("2. Browser check off: the server answers 422, same field");
await page.getByTestId("skip-client").check();
await page.getByTestId("plan").selectOption("pro");
await page.getByTestId("email").fill("ada@example.test");
await page.getByTestId("start").fill("2026-03-10");
await page.getByTestId("quantity").fill("1");
await pause(600);
const answer = page.waitForResponse((r) => r.url().includes("/signups"));
await page.getByTestId("submit").click();
if ((await answer).status() !== 422) throw new Error("expected the server to answer 422");
await page.getByTestId("error-company").waitFor({ state: "visible" });
await pause(2200);

// 3. Fix it.
await caption("3. Add a company: browser and server both accept it");
await page.getByTestId("skip-client").uncheck();
await type("company", "Example Ltd");
await page.getByTestId("submit").click();
await page.getByTestId("result").waitFor();
await pause(1500);

await context.close();
await browser.close();

if (frame === 0) throw new Error(`no frames captured in ${work}`);
mkdirSync(dirname(out), { recursive: true });
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    String(FPS),
    "-i",
    join(work, "f%04d.png"),
    "-vf",
    "scale=520:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse",
    out,
  ],
  { stdio: "inherit" },
);
console.log(`wrote ${out}`);
