// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const GH = "https://github.com/metatoy/validonce/blob/main";

// Reader order: what it is, your server, your client, the format, then reference.
// scripts/check.mjs fails the build if a docs/*.md file is missing from here.
export const ORDER = {
  overview: ["README", "how-it-works"],
  server: [
    "getting-started-aspnet",
    "getting-started-fastapi",
    "getting-started-fastify",
    "getting-started-nestjs",
    "getting-started-go",
    "getting-started-spring",
  ],
  clients: ["client-react", "client-angular", "client-vue", "client-dom", "client-codegen"],
  format: ["rule-format-v1", "live-rules", "kubernetes"],
  agents: ["agentic-migration"],
  reference: ["comparison", "regex-findings"],
  project: ["releasing"],
} as const;

const sidebars: SidebarsConfig = {
  docs: [
    { type: "category", label: "Overview", collapsible: false, items: [...ORDER.overview] },
    { type: "category", label: "Getting started: server", items: [...ORDER.server] },
    { type: "category", label: "Clients", items: [...ORDER.clients] },
    { type: "category", label: "Rule format", items: [...ORDER.format] },
    {
      type: "category",
      label: "Agents and MCP",
      items: [
        ...ORDER.agents,
        { type: "link", label: "MCP server (validonce-mcp)", href: `${GH}/mcp/README.md` },
      ],
    },
    {
      type: "category",
      label: "Reference",
      items: [
        ...ORDER.reference,
        { type: "link", label: "JavaScript package", href: `${GH}/js/README.md` },
        { type: "link", label: "Python package", href: `${GH}/python/README.md` },
        { type: "link", label: ".NET packages", href: `${GH}/dotnet/README.md` },
        { type: "link", label: "Go module", href: `${GH}/go/README.md` },
        { type: "link", label: "Java and Kotlin", href: `${GH}/java/README.md` },
        { type: "link", label: "Changelog", href: `${GH}/CHANGELOG.md` },
      ],
    },
    {
      type: "category",
      label: "Project",
      items: [
        { type: "link", label: "Contributing", href: `${GH}/CONTRIBUTING.md` },
        ...ORDER.project,
      ],
    },
  ],
};

export default sidebars;
