// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { open, readFile, stat } from "node:fs/promises";
import { resolveInsideRoots, resolveNewFileInsideRoots } from "./roots";
import { ToolError } from "./sdk";

export const MAX_JSONL_BYTES = 64_000_000;

/** Reads a JSONL file (or a JSON array file) inside the roots. Never echoes file content in errors. */
export async function loadJsonl(path: string, roots: string[]): Promise<unknown[]> {
  const real = await resolveInsideRoots(path, roots);
  let size: number;
  try {
    size = (await stat(real)).size;
  } catch {
    throw new ToolError("File not found.");
  }
  if (size > MAX_JSONL_BYTES) throw new ToolError(`File is larger than ${MAX_JSONL_BYTES} bytes.`);
  const text = await readFile(real, "utf8");
  if (text.trimStart().startsWith("[")) {
    try {
      const v = JSON.parse(text);
      if (Array.isArray(v)) return v;
    } catch {
      /* fall through to the error below */
    }
    throw new ToolError("File is not valid JSON.");
  }
  const out: unknown[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] as string).trim();
    if (line === "") continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      throw new ToolError(`Line ${i + 1} is not valid JSON.`);
    }
  }
  return out;
}

/** Creates a NEW .jsonl file inside the roots; fails if it exists (never overwrites). */
export async function writeNewJsonl(path: string, roots: string[], text: string): Promise<string> {
  if (!path.endsWith(".jsonl")) throw new ToolError("outFile must end in .jsonl.");
  const full = await resolveNewFileInsideRoots(path, roots);
  let fh;
  try {
    fh = await open(full, "wx", 0o644);
  } catch {
    throw new ToolError("outFile already exists or cannot be created. Choose a new file name.");
  }
  try {
    await fh.writeFile(text, "utf8");
  } finally {
    await fh.close();
  }
  return full;
}
