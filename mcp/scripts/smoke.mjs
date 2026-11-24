// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Starts an installed validonce-mcp over stdio, initializes it and lists its tools. Fails unless the
// server reports the expected version and every tool. CI runs it against the packed tarball installed in
// an empty project, so a package that cannot install (e.g. a leftover "workspace:" dependency) or
// start is caught before it is published.
//   node scripts/smoke.mjs <server command> [args...]     (expects mcp/package.json's version)
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const expected = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const TOOLS = ["read_openapi_rules", "check_rules", "evaluate", "generate_inputs", "compare_results", "generate_code"];
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: node scripts/smoke.mjs <server command> [args...]");
  process.exit(2);
}
const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "inherit"] });
const fail = (msg) => {
  console.error(`smoke: ${msg}`);
  p.kill();
  process.exit(1);
};
const timer = setTimeout(() => fail("no answer within 60 s"), 60_000);
p.on("exit", (code) => fail(`server exited early (code ${code})`));
const send = (m) => p.stdin.write(`${JSON.stringify(m)}\n`);
let buf = "";
p.stdout.on("data", (d) => {
  buf += d;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.id === 1) {
      const v = m.result?.serverInfo?.version;
      if (v !== expected) fail(`server reports version ${v}, package is ${expected}`);
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    } else if (m.id === 2) {
      const names = (m.result?.tools ?? []).map((t) => t.name);
      const missing = TOOLS.filter((t) => !names.includes(t));
      if (missing.length) fail(`missing tools: ${missing.join(", ")}`);
      clearTimeout(timer);
      console.log(`smoke: validonce-mcp ${expected} started; tools: ${names.join(", ")}`);
      p.removeAllListeners("exit");
      p.kill();
      process.exit(0);
    }
  }
});
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } });
