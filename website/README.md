<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 Metatoy LLC
-->

# The validonce docs site

The source of [validonce.metatoy.com](https://validonce.metatoy.com), built with Docusaurus and served by Cloudflare Pages from `main`.

- **The pages are the repository's `docs/` folder,** read in place. They stay plain Markdown, so they read the same on GitHub. Only the pages in `src/pages/` (the landing page, the quickstart and the live rule examples) use MDX and React.
- **Links that leave `docs/`** (to `examples/`, `js/` and so on) are turned into GitHub links at build time by `src/plugins/repo-links.ts`: to `main` for the current docs, and to the release tag for a frozen version.
- **Versions:** `main` is shown as "Next (unreleased)". Each minor release is frozen from its tag with `node scripts/snapshot.mjs X.Y vX.Y.0` (see `docs/releasing.md`).
- **Code samples** in the stack tabs are cut from the example apps between `playground:begin` and `playground:end` markers, the same ones the playground uses, so they can't drift from the code.
- **The live examples** run the real `validonce` package in the browser. Nothing is sent to a server.
- **For agents:** the site serves the repository's `llms.txt` unchanged and a generated `llms-full.txt` with every page.

```sh
pnpm install
pnpm --filter validonce build      # the live examples import the built package
cd website
pnpm start                         # dev server
pnpm build && pnpm check && pnpm e2e
```

A new page in `docs/` must be added to `ORDER` in `sidebars.ts`; `pnpm check` fails otherwise.
