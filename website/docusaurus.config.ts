// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";
import repoLinks from "./src/plugins/repo-links.ts";

const REPO = "https://github.com/metatoy/validonce";

const config: Config = {
  title: "validonce",
  tagline: "Write cross-field validation rules once, on the server, and enforce them in the browser.",
  favicon: "img/favicon.svg",
  url: "https://validonce.metatoy.com",
  baseUrl: "/",
  organizationName: "metatoy",
  projectName: "validonce",
  trailingSlash: false,

  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  markdown: {
    // docs/*.md stay plain CommonMark so GitHub renders them the same way.
    format: "detect",
    hooks: { onBrokenMarkdownLinks: "throw", onBrokenMarkdownImages: "throw" },
  },

  i18n: { defaultLocale: "en", locales: ["en"] },

  presets: [
    [
      "classic",
      {
        docs: {
          // The source of truth is the repository's docs/ folder, read in place.
          path: "../docs",
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts",
          exclude: ["**/*.json"],
          editUrl: `${REPO}/edit/main/`,
          editCurrentVersion: true,
          beforeDefaultRemarkPlugins: [repoLinks],
          lastVersion: "0.5",
          versions: {
            current: { label: "Next (unreleased)", path: "next", banner: "unreleased" },
          },
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      "@easyops-cn/docusaurus-search-local",
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: "docs",
        docsDir: "../docs",
        searchContextByPaths: [],
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: "validonce",
      logo: {
        alt: "validonce",
        src: "img/icon-light.svg",
        srcDark: "img/icon-dark.svg",
      },
      items: [
        { type: "docSidebar", sidebarId: "docs", position: "left", label: "Docs" },
        { to: "/quickstart", label: "Quickstart", position: "left" },
        { href: "https://playground.metatoy.com", label: "Playground", position: "left" },
        { type: "docsVersionDropdown", position: "right" },
        { href: REPO, label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "How it works", to: "/docs/how-it-works" },
            { label: "Rule format v1", to: "/docs/rule-format-v1" },
            { label: "Agentic migration", to: "/docs/agentic-migration" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "GitHub", href: REPO },
            { label: "Changelog", href: `${REPO}/blob/main/CHANGELOG.md` },
            { label: "Playground", href: "https://playground.metatoy.com" },
          ],
        },
        {
          title: "For agents",
          items: [
            { label: "llms.txt", href: "pathname:///llms.txt" },
            { label: "llms-full.txt", href: "pathname:///llms-full.txt" },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Metatoy LLC. Apache-2.0.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["csharp", "java", "go", "python", "bash", "json", "yaml"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
