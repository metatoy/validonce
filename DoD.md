# Definition of done (validonce)

A Part is done only when every box can be checked with evidence. A box that cannot be checked is reported as open, never marked done.

- [ ] **Acceptance mapped.** Each exit check for the Part in the build plan is met, one by one, with nothing dropped.
- [ ] **Tests green, with output.** The commands and their output are pasted: `dotnet test`, `pnpm test`, `uv run pytest`, as relevant to the Part.
- [ ] **Shared cases pass everywhere they apply.** Every implementation that exists so far passes the same `conformance/rules/` files, with identical case counts.
- [ ] **Verified on a real surface** where the Part has one: a Playwright run of an example app, with screenshots. If the surface could not be run, the box stays open.
- [ ] **No generated output committed.** No `bin/`, `obj/`, `dist/`, `node_modules/`, `.venv/` or `*.gen.ts`. `conformance/golden/` is the exception: those are fixtures.
- [ ] **Scope honored.** Only the Part's work changed. Nothing gated (public repo, registry publish) happened without the founder.
- [ ] **CI green on GitHub** for the pushed commit, with the run linked.
- [ ] **Records current.** Behavior changes update `docs/` and `CHANGELOG.md`; the commit message explains why.
