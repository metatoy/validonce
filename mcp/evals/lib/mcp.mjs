// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// A tiny MCP client for the assertions: spawns the locally built validonce-mcp over stdio with the
// given roots, so the differential check uses the same compare_results the agent does.
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { mcpEntry } from "./util.mjs";

export async function withMcp(roots, fn) {
  const client = new Client({ name: "validonce-evals", version: "0" }, { capabilities: { roots: {} } });
  client.setRequestHandler("roots/list", async () => ({ roots: roots.map((r) => ({ uri: pathToFileURL(r).href })) }));
  const transport = new StdioClientTransport({ command: process.execPath, args: [mcpEntry], cwd: roots[0], stderr: "ignore" });
  await client.connect(transport);
  try {
    const call = async (name, args) => {
      const r = await client.callTool({ name, arguments: args });
      if (r.isError) throw new Error(`${name}: ${r.content?.map((c) => c.text).join(" ")}`);
      return r.structuredContent ?? JSON.parse(r.content[0].text);
    };
    return await fn(call);
  } finally {
    await client.close();
  }
}
