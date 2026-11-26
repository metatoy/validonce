# CLAUDE.md (validonce)

Guidance for agents working in this repo.

- **The contract:** `docs/rule-format-v1.md` and `conformance/`. Never change an expected result to make an implementation pass; fix the implementation, or change the spec and the case together and explain why in the commit message.
- **Priority order:** C# (`dotnet/`), then TypeScript (`js/`), then Python (`python/`).
- **Languages:** C# on net10.0; TypeScript (strict) for the JS package; Python 3.10+ with uv, hatchling, ruff, pytest.
- **Heavy commands one at a time** on the founder's Mac: `dotnet build/test`, `pnpm install`, `uv sync`, Playwright.
- **Lockfiles:** one `pnpm-lock.yaml` at the repo root, `python/uv.lock`. No npm lockfiles.
- **Commits** are authored as the repo's configured identity. No session trailers. No force-push. Publishing to any registry and making the repo public are founder decisions.
- **Copyright header on every source file** (C#, TypeScript, Python, workflow YAML), as the first two lines, in that language's comment syntax:
  `SPDX-License-Identifier: Apache-2.0` and `Copyright 2026 Metatoy LLC`. Keep `LICENSE` and `NOTICE` in every published package. Package metadata names Metatoy LLC as author and copyright holder.
- **No employer code, schemas or examples.** Examples use generic names and `example.test` addresses.
