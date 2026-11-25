// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { ReactNode } from "react";

// Simple syntax tinting, no highlighter library: comments, strings (JSON keys apart), a short list of
// keywords across the seven languages, and numbers.

const KEYWORDS = new Set(
  (
    "public private protected class record static final new void return func type struct def from import " +
    "var val const let interface extends implements package string int bool when null true false self " +
    "export async await override sealed readonly using namespace if else is in"
  ).split(" "),
);

const TOKEN = /(\/\/.*|#.*)|("(?:[^"\\]|\\.)*"|'[^'\n]*'|`[^`\n]*`)|([A-Za-z_]\w*)|(\b\d+(?:\.\d+)?\b)/g;

export function tint(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [whole, comment, str, word, num] = m;
    const key = n++;
    if (comment !== undefined) {
      out.push(<span key={key} className="t-c">{whole}</span>);
    } else if (str !== undefined) {
      const isKey = text.slice(at + whole.length).startsWith(":") && str.startsWith('"');
      out.push(<span key={key} className={isKey ? "t-k" : "t-s"}>{whole}</span>);
    } else if (word !== undefined && KEYWORDS.has(word)) {
      out.push(<span key={key} className="t-w">{whole}</span>);
    } else if (num !== undefined) {
      out.push(<span key={key} className="t-n">{whole}</span>);
    } else {
      out.push(whole);
    }
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
