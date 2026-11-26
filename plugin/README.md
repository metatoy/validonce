# validonce plugin (directory edition)

This folder is the edition of the validonce Claude Code plugin listed in Anthropic's plugin directory. It holds the `validonce-migrate` skill and its per-library guides, and nothing that runs code: no MCP server, no scripts.

It finds cross-field checks, classifies each one, and drafts validonce rules. The differential proof (generated inputs, the old validator run side by side with the new rules) needs the full plugin, which bundles the validonce MCP server and the old-validator runners. Install the full plugin from the repository's own marketplace, as described in [Migrate with an agent](https://validonce.metatoy.com/docs/agentic-migration).

The guides in `skills/validonce-migrate/references/` and the report template are copies of the ones in the repository's top-level `skills/` folder. `scripts/sync-directory-plugin.mjs` copies them, and CI fails if they drift.

Apache-2.0. Copyright 2026 Metatoy LLC.
