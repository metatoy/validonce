// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC
// Runs regex fixtures on the JavaScript engine (V8 in Node), without and with the `u` flag.
// Usage: node js.mjs <fixtures-dir>   Prints one JSON object to stdout.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node js.mjs <fixtures-dir>");
  process.exit(2);
}

function run(pattern, text, flags) {
  let re;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return "error";
  }
  return re.test(text) ? "match" : "no-match";
}

const results = {};
const files = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".json"))
  .map((d) => d.name)
  .sort();
for (const name of files) {
  const doc = JSON.parse(readFileSync(join(dir, name), "utf8"));
  for (const c of doc.cases) {
    c.inputs.forEach((inp, i) => {
      results[`${c.id}#${i}`] = {
        js: run(c.pattern, inp.text, ""),
        "js-u": run(c.pattern, inp.text, "u"),
      };
    });
  }
}
process.stdout.write(
  JSON.stringify({ "engine-versions": { node: process.version, v8: process.versions.v8 }, results }) + "\n",
);
