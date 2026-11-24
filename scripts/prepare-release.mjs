// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Sets a new validonce version everywhere it lives, renames the CHANGELOG's "## Unreleased" heading to
// the version and date, refreshes python/uv.lock, and checks that the old version is gone. It does not
// commit, tag or publish: review the diff, open a release PR, merge it, then publish the GitHub Release
// v<version> (that runs the npm, PyPI and NuGet publish workflows).
//
// Usage, from the repo root:  node scripts/prepare-release.mjs X.Y.Z [--date YYYY-MM-DD]
// (validonce-mcp has its own version in mcp/package.json and its own release; see publish-npm.yml.)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const next = args.find((a) => !a.startsWith("--"));
const dateArg = args.includes("--date") ? args[args.indexOf("--date") + 1] : undefined;
const date = dateArg ?? new Date().toISOString().slice(0, 10);
const die = (msg) => {
  console.error(`prepare-release: ${msg}`);
  process.exit(1);
};

if (!next || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(next)) die("usage: node scripts/prepare-release.mjs <version X.Y.Z> [--date YYYY-MM-DD]");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`--date must be YYYY-MM-DD, got ${date}`);
const current = JSON.parse(readFileSync(join(root, "js/package.json"), "utf8")).version;
if (current === next) die(`already at ${next}`);

/** [file, pattern with one capture group for the version, replacement] */
const edits = [
  ["dotnet/Directory.Build.props", /<Version>([^<]+)<\/Version>/, `<Version>${next}</Version>`],
  ["js/package.json", /"version": "([^"]+)"/, `"version": "${next}"`],
  ["python/pyproject.toml", /^version = "([^"]+)"/m, `version = "${next}"`],
  ["python/src/validonce/__init__.py", /__version__ = "([^"]+)"/, `__version__ = "${next}"`],
  ["deploy/helm/validonce-demo/Chart.yaml", /^appVersion: "([^"]+)"/m, `appVersion: "${next}"`],
  [".github/ISSUE_TEMPLATE/bug_report.yml", /validonce (\d+\.\d+\.\d+[^,]*),/, `validonce ${next},`],
  ["java/gradle.properties", /^version=(.+)$/m, `version=${next}`],
  ["README.md", /com\.metatoy:validonce-spring:([^"]+)"/, `com.metatoy:validonce-spring:${next}"`],
];

for (const [file, re, replacement] of edits) {
  const path = join(root, file);
  const text = readFileSync(path, "utf8");
  const m = re.exec(text);
  if (!m) die(`${file}: no version found (${re})`);
  if (m[1] !== current && m[1] !== next) die(`${file}: has ${m[1]}, expected the current version ${current}; fix it by hand first`);
  writeFileSync(path, text.replace(re, replacement));
  console.log(`${file}: ${current} -> ${next}`);
}

// The demo chart's own version moves with appVersion (patch bump), as Helm expects.
{
  const path = join(root, "deploy/helm/validonce-demo/Chart.yaml");
  const text = readFileSync(path, "utf8");
  const m = /^version: (\d+)\.(\d+)\.(\d+)$/m.exec(text);
  if (!m) die("Chart.yaml: no chart version");
  const bumped = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
  writeFileSync(path, text.replace(m[0], `version: ${bumped}`));
  console.log(`deploy/helm/validonce-demo/Chart.yaml: chart ${m[1]}.${m[2]}.${m[3]} -> ${bumped}`);
}

// CHANGELOG: the "## Unreleased" section becomes this version.
{
  const path = join(root, "CHANGELOG.md");
  const text = readFileSync(path, "utf8");
  if (!/^## Unreleased$/m.test(text)) die('CHANGELOG.md: add a "## Unreleased" section with this release\'s notes first');
  writeFileSync(path, text.replace(/^## Unreleased$/m, `## ${next} (${date})`));
  console.log(`CHANGELOG.md: "## Unreleased" -> "## ${next} (${date})"`);
}

// python/uv.lock records the package's own version.
try {
  execFileSync("uv", ["lock", "-q"], { cwd: join(root, "python"), stdio: "inherit" });
  console.log("python/uv.lock: refreshed");
} catch {
  die("uv lock failed (is uv installed?); run `uv lock` in python/ before committing");
}

// Nothing may still carry the old version (the CHANGELOG history and lockfiles excepted).
const leftover = (() => {
  try {
    return execFileSync("git", ["grep", "-n", "-F", current, "--", ".", ":!CHANGELOG.md", ":!pnpm-lock.yaml", ":!python/uv.lock", ":!mcp/**", ":!scripts/prepare-release.mjs"], { cwd: root, encoding: "utf8" });
  } catch {
    return ""; // git grep exits 1 when nothing matches
  }
})();
if (leftover.trim()) die(`the old version ${current} is still in:\n${leftover}`);

console.log(`\nReady: review \`git diff\`, open a release PR for ${next}, merge it, then publish the GitHub Release v${next}.`);
