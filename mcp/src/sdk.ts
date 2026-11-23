// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// The only file that imports the MCP SDK. SDK upgrades touch this file alone.

import {
  InMemoryTransport,
  McpServer,
  type Transport,
} from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import type { z } from "zod";

/** Largest serialized tool result we return, in characters. */
export const MAX_OUTPUT_CHARS = 200_000;

/** Thrown by a tool handler to report a clear, safe-to-show failure. */
export class ToolError extends Error {}

export type ValidonceServer = McpServer;

export function createServer(name: string, version: string): ValidonceServer {
  return new McpServer({ name, version });
}

interface ToolSpec<I extends z.ZodObject> {
  name: string;
  title: string;
  description: string;
  input: I;
  handler: (args: z.infer<I>) => Promise<object> | object;
}

/** Registers a read-only tool. The result goes out as structured JSON, capped in size. */
export function defineReadOnlyTool<I extends z.ZodObject>(
  server: ValidonceServer,
  spec: ToolSpec<I>,
): void {
  register(server, spec, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
}

/**
 * Registers a tool that may write one NEW file (never overwrites). Used only by tools whose
 * output cannot fit in a tool result. It is not read-only, and says so to the client.
 */
export function defineWritingTool<I extends z.ZodObject>(
  server: ValidonceServer,
  spec: ToolSpec<I>,
): void {
  register(server, spec, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  });
}

function register<I extends z.ZodObject>(
  server: ValidonceServer,
  spec: ToolSpec<I>,
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  },
): void {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.input as z.ZodObject,
      annotations,
    },
    async (args: unknown) => {
      try {
        const result = (await spec.handler(args as z.infer<I>)) as Record<string, unknown>;
        const text = JSON.stringify(result);
        if (text.length > MAX_OUTPUT_CHARS) {
          return fail(
            `Result is larger than ${MAX_OUTPUT_CHARS} characters. Narrow the input (one schema, fewer payloads).`,
          );
        }
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: result,
        };
      } catch (e) {
        return fail(
          e instanceof ToolError ? e.message : "Unexpected internal error.",
        );
      }
    },
  );
}

function fail(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

/**
 * The client's root directories as filesystem paths, or undefined when the client does not
 * provide roots (the caller then falls back to a default).
 */
export async function listClientRoots(
  server: ValidonceServer,
): Promise<string[] | undefined> {
  try {
    if (!server.server.getClientCapabilities()?.roots) return undefined;
    const { roots } = await server.server.listRoots();
    return roots.map((r) => r.uri);
  } catch {
    return undefined;
  }
}

export async function connect(
  server: ValidonceServer,
  transport: Transport,
): Promise<void> {
  await server.connect(transport);
}

export async function serveStdio(server: ValidonceServer): Promise<void> {
  await connect(server, new StdioServerTransport());
}

export function createLinkedTransports(): [Transport, Transport] {
  return InMemoryTransport.createLinkedPair();
}
