// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Remark plugin for the docs read from ../docs (and the frozen copies in versioned_docs/).
// The files are written for GitHub, so links that leave docs/ (../examples/..., ../js/README.md)
// become GitHub links at the right ref: main for the current docs, the release tag for a
// frozen version. Links between docs pages are left to Docusaurus. ../assets/ images are
// served from the site (scripts/prepare.mjs copies them to static/assets/).

import { readFileSync } from "node:fs";
import { dirname, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "https://github.com/metatoy/validonce";
const site = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const currentDocs = resolve(site, "../docs");
const refs: Record<string, string> = JSON.parse(
  readFileSync(resolve(site, "version-refs.json"), "utf8"),
);

type Node = { type: string; url?: string; value?: string; children?: Node[] };

function rootAndRef(file: string): { root: string; ref: string } {
  const m = file.split(sep).join("/").match(/\/versioned_docs\/version-([^/]+)\//);
  if (m) {
    const ref = refs[m[1]];
    if (!ref) throw new Error(`version-refs.json has no tag for version ${m[1]}`);
    return { root: resolve(site, "versioned_docs", `version-${m[1]}`), ref };
  }
  return { root: currentDocs, ref: "main" };
}

export function rewrite(url: string, file: string): string {
  if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(url)) return url;
  const [path, hash] = url.split("#", 2);
  if (!path) return url;
  if (path.startsWith("../assets/")) return `/${path.slice(3)}${hash ? `#${hash}` : ""}`;
  const { root, ref } = rootAndRef(file);
  const target = resolve(dirname(file), decodeURI(path));
  const inDocs = relative(root, target);
  if (!inDocs.startsWith("..") && /\.mdx?$/.test(path)) return url;
  const repoPath = posix.normalize(`docs/${inDocs.split(sep).join("/")}`);
  return `${REPO}/blob/${ref}/${repoPath}${hash ? `#${hash}` : ""}`;
}

function walk(node: Node, file: string): void {
  if ((node.type === "link" || node.type === "definition" || node.type === "image") && node.url) {
    node.url = rewrite(node.url, file);
  } else if (node.type === "html" && node.value) {
    node.value = node.value.replace(/(["'])\.\.\/assets\//g, "$1/assets/");
  }
  for (const child of node.children ?? []) walk(child, file);
}

export default function repoLinks() {
  return (tree: Node, vfile: { path?: string }) => {
    if (vfile.path) walk(tree, vfile.path);
  };
}
