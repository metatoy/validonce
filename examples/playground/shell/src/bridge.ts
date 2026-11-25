// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// The postMessage contract with the frames (frames/shared/src/index.ts), read defensively.

export interface IssueLite {
  ruleId: string;
  key?: string;
  path: string[];
}

export interface RequestRecord {
  method: string;
  url: string;
  status: number;
  body: unknown;
  ms: number;
}

export type FrameEvent =
  | { type: "ready"; framework: string }
  | { type: "issues"; source: "client" | "server"; issues: IssueLite[] }
  | { type: "request"; record: RequestRecord };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Parse a `validonce:*` message from a frame; anything else is undefined. */
export function parseFrameEvent(data: unknown): FrameEvent | undefined {
  if (!isObj(data) || typeof data.type !== "string") return undefined;
  if (data.type === "validonce:ready") {
    return { type: "ready", framework: String(data.framework ?? "") };
  }
  if (data.type === "validonce:issues") {
    const source = data.source === "server" ? "server" : "client";
    const issues = (Array.isArray(data.issues) ? data.issues : []).flatMap((i): IssueLite[] => {
      if (!isObj(i) || typeof i.ruleId !== "string") return [];
      const path = Array.isArray(i.path) ? i.path.map(String) : [];
      return [{ ruleId: i.ruleId, key: typeof i.key === "string" ? i.key : undefined, path }];
    });
    return { type: "issues", source, issues };
  }
  if (data.type === "validonce:request") {
    return {
      type: "request",
      record: {
        method: String(data.method ?? "POST"),
        url: String(data.url ?? ""),
        status: Number(data.status ?? 0),
        body: data.body,
        ms: Number(data.ms ?? 0),
      },
    };
  }
  return undefined;
}
