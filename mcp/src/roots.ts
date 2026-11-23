// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ToolError } from "./sdk";

function toPath(uriOrPath: string): string {
  return uriOrPath.startsWith("file://")
    ? fileURLToPath(uriOrPath)
    : resolve(uriOrPath);
}

async function real(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return resolve(p);
  }
}

/**
 * Returns the real path of `target` when it lies inside one of `roots`; otherwise throws a
 * ToolError. Symlinks are resolved first, so a link out of a root is rejected.
 */
export async function resolveInsideRoots(
  target: string,
  roots: string[],
): Promise<string> {
  const abs = await real(toPath(target));
  await requireInside(abs, roots);
  return abs;
}

/**
 * Path for a file that does not exist yet: the parent directory must exist and (with symlinks
 * resolved) lie inside a root. The file itself is created by the caller with exclusive-create.
 */
export async function resolveNewFileInsideRoots(
  target: string,
  roots: string[],
): Promise<string> {
  const abs = toPath(target);
  let parent: string;
  try {
    parent = await realpath(dirname(abs));
  } catch {
    throw new ToolError("The directory of outFile does not exist.");
  }
  const full = join(parent, basename(abs));
  await requireInside(full, roots);
  return full;
}

async function requireInside(abs: string, roots: string[]): Promise<void> {
  for (const root of roots) {
    const r = await real(toPath(root));
    const rel = relative(r, abs);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
  }
  throw new ToolError(
    "Path is outside the allowed roots. Only files inside the client's workspace roots can be used.",
  );
}

export { isAbsolute };
